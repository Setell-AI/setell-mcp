/**
 * setell_get_quote_tiers — list the good/better/best option groups generated
 * for a job (most recent first), with each tier's label, summary, line
 * items, total, and whether the base quote is still current.
 *
 * `baseIsCurrent: false` means setell_select_quote_tier will conflict (the
 * quote moved on since the options were generated) — regenerate instead.
 * Read-only. Maps to GET /api/mcp/v1/quote-tiers?jobId=...
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  ListQuoteTiersResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The job to list tier options for. Find it via setell_find_jobs or the ' +
        'setell://jobs resource.',
    ),
};

export function registerGetQuoteTiersTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_get_quote_tiers',
    {
      title: 'List Setell quote tiers',
      description:
        'List the good/better/best option groups generated for a job (most recent ' +
        "first) — each tier's label, summary, line items, total, and whether the base " +
        'quote is still current (baseIsCurrent: false means select will conflict; ' +
        'regenerate instead). Read-only.',
      annotations: {
        title: 'List Setell quote tiers',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { jobId } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.get('/api/mcp/v1/quote-tiers', ListQuoteTiersResponseSchema, {
          jobId,
        });
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_quote_tiers');
        throw err;
      }
    },
  );
}
