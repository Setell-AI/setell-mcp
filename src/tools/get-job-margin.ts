/**
 * setell_get_job_margin — realized margin for one job ("what did I actually
 * make?"), the retrospective half of Setell's pricing intelligence.
 *
 * Revenue from recorded payments (fallback: decided quote total); per-line
 * cost from the operator's price-book provenance, a high-trust price-book
 * match, or labor hours × their loaded labor rate. marginPct is WITHHELD
 * (null) when too little line value has a sourced cost — the calling agent
 * presents the breakdown's UNKNOWN lines honestly instead of inventing a
 * number. `no_quote` is an honest data condition.
 *
 * OPERATOR-ONLY data — never surface cost/margin to a customer.
 * Read-only. Maps to GET /api/mcp/v1/margin?jobId=...
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import { JobMarginResponseSchema, errorResultFromApi, successResultFromJson } from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The job to compute realized margin for. Find it via setell_find_jobs or the ' +
        'setell://jobs resource.',
    ),
};

export function registerGetJobMarginTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_get_job_margin',
    {
      title: 'Setell realized job margin',
      description:
        'What the operator ACTUALLY made on a job (realized margin). Revenue from ' +
        'recorded payments (fallback: the decided quote total); per-line cost from ' +
        "the operator's price-book provenance, a high-trust price-book match, or " +
        'labor hours × their loaded labor rate. marginPct is WITHHELD (null) when ' +
        "too little line value has a sourced cost — present the breakdown's UNKNOWN " +
        'lines honestly instead of inventing a number. OPERATOR-ONLY data: never ' +
        'share cost or margin with a customer. Read-only.',
      annotations: {
        title: 'Setell realized job margin',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { jobId } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.get('/api/mcp/v1/margin', JobMarginResponseSchema, { jobId });
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_job_margin');
        throw err;
      }
    },
  );
}
