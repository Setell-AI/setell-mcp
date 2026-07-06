/**
 * setell_get_margin_summary — realized margin across the operator's recent
 * WON jobs: where the money actually lands vs their target.
 *
 * Revenue-weighted overall margin over honestly-costed jobs only,
 * per-jobType averages (worst first), the 3 worst jobs, below-target count,
 * and the uncosted-jobs count (jobs whose cost coverage was too thin).
 *
 * OPERATOR-ONLY data — never surface cost/margin to a customer.
 * Read-only. Maps to GET /api/mcp/v1/margin/summary?limit=...
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  MarginSummaryResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('How many recent won jobs to consider (1-50). Defaults to 25.'),
};

export function registerGetMarginSummaryTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_get_margin_summary',
    {
      title: 'Setell margin summary',
      description:
        "Realized margin across the operator's recent WON jobs: revenue-weighted " +
        'overall margin (honestly-costed jobs only), per-jobType averages (worst ' +
        'first), the 3 worst jobs, the count below their target margin, and how many ' +
        "jobs could not be costed. Use for 'how are my margins?' or monthly " +
        'profitability check-ins. OPERATOR-ONLY data. Read-only.',
      annotations: {
        title: 'Setell margin summary',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { limit } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.get(
          '/api/mcp/v1/margin/summary',
          MarginSummaryResponseSchema,
          limit !== undefined ? { limit } : undefined,
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_margin_summary');
        throw err;
      }
    },
  );
}
