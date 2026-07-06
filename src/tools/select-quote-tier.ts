/**
 * setell_select_quote_tier — make a chosen good/better/best tier the job's
 * active quote.
 *
 * GOOD/BEST materialize a NEW quote version from that tier's line items via
 * Setell's deterministic revision engine (immutable versions, full audit
 * trail); BETTER is a no-op since it already IS the baseline. Only works
 * while the options are current — a conflict (HTTP 409, code `stale`) means
 * the quote changed since they were generated; regenerate first.
 *
 * Maps to POST /api/mcp/v1/quote-tiers/select.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  SelectQuoteTierResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  tierGroupId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The tier group id returned by setell_generate_quote_tiers or setell_get_quote_tiers.',
    ),
  level: z.enum(['GOOD', 'BETTER', 'BEST']).describe('Which tier to apply.'),
};

export function registerSelectQuoteTierTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_select_quote_tier',
    {
      title: 'Select a Setell quote tier',
      description:
        "Make a chosen good/better/best tier the job's active quote. GOOD/BEST create " +
        "a new quote version from that tier's line items via the deterministic " +
        'revision engine; BETTER is a no-op (it already IS the baseline). A 409 with ' +
        'code stale means the quote changed since the options were generated — ' +
        'regenerate first. After selecting, compose/send operate on the chosen tier.',
      annotations: {
        title: 'Select a Setell quote tier',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { tierGroupId, level } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.post(
          '/api/mcp/v1/quote-tiers/select',
          SelectQuoteTierResponseSchema,
          { tierGroupId, level },
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_select_quote_tier');
        throw err;
      }
    },
  );
}
