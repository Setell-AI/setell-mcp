/**
 * setell_propose_parts_list — "knows your parts list" exposed as an MCP
 * primitive (Pricing Intelligence §3, the category-killer).
 *
 * The calling agent passes a jobId; Setell mines the operator's OWN similar
 * past jobs for parts that co-occur on this kind of work, adapts them to
 * the new job's scope, and prices each from the operator's history — every
 * part carries a provenance receipt (HISTORICAL / CATALOG / BENCHMARK /
 * AI_ESTIMATE) plus evidence support (how many similar jobs used it).
 *
 * PROPOSAL ONLY — present it for the operator to confirm or edit; creating
 * the quote is a separate, deliberate call. `no_history` is an honest data
 * condition (the list builds itself as signed quotes + QuickBooks history
 * accumulate), not an error.
 *
 * Read-only; burns ~1 model call against the operator's daily AI budget,
 * governed server-side. Maps to GET /api/mcp/v1/parts-proposal?jobId=...
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  PartsProposalResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The job id to derive a parts list for. Find it via setell_find_jobs or the ' +
        'setell://jobs resource.',
    ),
};

export function registerProposePartsListTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_propose_parts_list',
    {
      title: 'Setell parts-list proposal',
      description:
        "Derive a full parts-list proposal for a job from the operator's OWN history: " +
        'similar past jobs are mined for co-occurring parts, adapted to this job, and ' +
        "each part returns priced from the operator's history with a provenance " +
        'receipt and evidence support (`support.jobCount` / `support.share`). ' +
        'PROPOSAL ONLY — present it for the operator to confirm or edit, then create ' +
        'the quote as a separate call. `no_history` means the operator has no ' +
        'similar past jobs with line items yet. Read-only.',
      annotations: {
        title: 'Setell parts-list proposal',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { jobId } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.get('/api/mcp/v1/parts-proposal', PartsProposalResponseSchema, {
          jobId,
        });
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_propose_parts_list');
        throw err;
      }
    },
  );
}
