/**
 * setell_get_customer_baseline — read the learned pricing baseline for a
 * specific customer.
 *
 * Surfaces the CustomerLearnedBaseline rows from PR #219 commit 3
 * (Vertical Moat). Returns one row per jobType scope (e.g.
 * `kitchen_remodel`, `bath_remodel`) plus the customer-wide row when
 * present (`jobType: null`). Each row has median/min/max + sampleSize
 * + lastSignedAt.
 *
 * The intent is "external agent answers questions about how I price for
 * this customer." Useful examples:
 *   - "What's my median for Cooper's kitchen jobs?"
 *   - "How many signed quotes do I have for this customer?"
 *   - "When did this customer last sign?"
 *
 * Read-only. Maps to GET /api/mcp/v1/customers/{id}/baseline.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  CustomerBaselineResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  customerId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The customer id whose pricing baseline to read. Find it via ' +
        'setell_find_customer or the setell://customers resource.',
    ),
};

export function registerGetCustomerBaselineTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_get_customer_baseline',
    {
      title: 'Setell customer pricing baseline',
      description:
        "Read the operator's learned pricing baseline for a specific " +
        'customer. Returns one row per jobType scope (e.g. ' +
        '`kitchen_remodel`) plus the customer-wide row when present ' +
        '(`jobType: null`). Each row has median / min / max / sampleSize / ' +
        'lastSignedAt — sampled over SIGNED quotes only, so it reflects ' +
        "the operator's actual pricing for this relationship. Useful for " +
        '"what did I charge Cooper last time?" / "how many signed quotes ' +
        'does this customer have?" Read-only.',
      annotations: {
        title: 'Setell customer pricing baseline',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { customerId } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.get(
          `/api/mcp/v1/customers/${encodeURIComponent(customerId)}/baseline`,
          CustomerBaselineResponseSchema,
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_customer_baseline');
        throw err;
      }
    },
  );
}
