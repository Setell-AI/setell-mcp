/**
 * setell_generate_quote_tiers — good/better/best options as an MCP primitive
 * ("three ways to win the work").
 *
 * The calling agent passes a jobId; Setell generates GOOD (leaner, lower
 * price) and BEST (expanded, premium) around the job's CURRENT quote — the
 * BETTER tier mirrors that baseline verbatim (never AI-restated, so the
 * recommended option can't drift from what the operator actually priced).
 *
 * Stores the options as a group only — the active quote does NOT change
 * until setell_select_quote_tier. Plan-gated AI surface; `no_quote` and
 * `generation_failed` are honest data conditions, not errors.
 *
 * Maps to POST /api/mcp/v1/quote-tiers/generate.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  GenerateQuoteTiersResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The job to generate options for (its current quote becomes the BETTER tier). ' +
        'Find it via setell_find_jobs or the setell://jobs resource.',
    ),
};

export function registerGenerateQuoteTiersTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_generate_quote_tiers',
    {
      title: 'Generate Setell quote tiers',
      description:
        "Generate good/better/best options around a job's current quote (proven " +
        'close-rate lifter): GOOD is a leaner lower-priced option, BETTER is the ' +
        'existing baseline (recommended, mirrored verbatim), BEST is an expanded ' +
        'premium option. Stores the options as a group and does NOT change the active ' +
        'quote — call setell_select_quote_tier once the operator or customer picks ' +
        "one. Plan-gated (counts against the operator's AI quota). `no_quote` means " +
        'the job has no quote yet.',
      annotations: {
        title: 'Generate Setell quote tiers',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { jobId } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.post(
          '/api/mcp/v1/quote-tiers/generate',
          GenerateQuoteTiersResponseSchema,
          { jobId },
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_generate_quote_tiers');
        throw err;
      }
    },
  );
}
