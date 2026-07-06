/**
 * setell_get_customer_memory — list every CustomerMemory row Setell has
 * stored for a specific customer.
 *
 * The read-side complement to `setell_save_customer_memory` (PR #14 /
 * #240). Closes BOXX-GAP §3.3 fully on the MCP surface: external agents
 * can now both READ and WRITE customer memories without going through
 * the in-app surface. Same Product Surface Architecture parity that
 * `setell_get_customer_baseline` ↔ in-app `get_customer_baseline`
 * already enforces for the per-customer pricing baseline.
 *
 * Returned shape per row:
 *   - id              — for future edit/delete tools (not yet exposed)
 *   - type            — PRICING | PREFERENCE | COMMUNICATION
 *   - content         — the learned pattern
 *   - sourceJobId     — the job that prompted the memory (when known)
 *   - source          — origin tag (`inline_save` for operator writes,
 *                       other tags for batch-extracted patterns)
 *   - confidence      — 0–1 score for batch-extracted rows; null for
 *                       inline saves (operator confirmation IS the
 *                       confidence signal)
 *   - createdAt / updatedAt — freshness signals
 *
 * Read-only. Maps to GET /api/mcp/v1/customers/{id}/memory.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  ListCustomerMemoryResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  customerId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The customer id whose memory rows to list. Find it via ' +
        'setell_find_customer or the setell://customers resource.',
    ),
};

export function registerGetCustomerMemoryTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_get_customer_memory',
    {
      title: 'Setell customer memory list',
      description:
        'List every CustomerMemory row Setell has stored for a specific ' +
        'customer — pricing patterns, preferences, communication style. ' +
        'Returns the full record shape (memory id, type, content, source ' +
        'job if any, source tag, confidence, timestamps). Useful for ' +
        '"what do I know about this customer?" / auditing what should be ' +
        'overwritten before calling setell_save_customer_memory. Read-only.',
      annotations: {
        title: 'Setell customer memory list',
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
          `/api/mcp/v1/customers/${encodeURIComponent(customerId)}/memory`,
          ListCustomerMemoryResponseSchema,
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_customer_memory');
        throw err;
      }
    },
  );
}
