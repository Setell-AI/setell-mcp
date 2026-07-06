/**
 * setell_save_customer_memory — persist a single learned pattern about a
 * customer mid-conversation.
 *
 * Mirrors the in-app `save_customer_memory` Boxx tool. The external-agent
 * peer of the operator-confirmed write path that closes BOXX-GAP §3.3 —
 * before this, customer memories could only be created by the AI-batch
 * `extractCustomerMemories` pass that runs post-acceptance, so a Claude
 * Code / Claude.ai / ChatGPT agent driving Setell couldn't say "noted
 * that Acme only responds to Wednesday emails" and have it persist for
 * the next inbound from that customer.
 *
 * Three memory types — same vocabulary as the in-app tool:
 *   - PRICING       — recurring rates, discount expectations
 *   - PREFERENCE    — quote-structure / special requirements
 *   - COMMUNICATION — tone, timing, what info they expect
 *
 * Maps to POST /api/mcp/v1/customers/{id}/memory.
 *
 * Mutator — `destructiveHint: true` because it creates a DB row that the
 * calling agent's next-turn read will see. `openWorldHint: false` because
 * the operation is fully scoped to the operator's CustomerMemory table.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  SaveCustomerMemoryResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  customerId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The customer id whose memory to save. Find it via ' +
        'setell_find_customer or the setell://customers resource.',
    ),
  type: z
    .enum(['PRICING', 'PREFERENCE', 'COMMUNICATION'])
    .describe(
      'PRICING for rate / discount patterns; PREFERENCE for quote-structure ' +
        '/ special requirements; COMMUNICATION for tone / timing / what info ' +
        'they expect.',
    ),
  content: z
    .string()
    .min(1)
    .max(500)
    .describe(
      'One sentence describing the pattern. Max 500 chars. Phrase as a ' +
        'stable fact the next-time-you-quote-this-customer Boxx can act ' +
        'on (e.g. "Always asks for PO number on quotes over $5,000").',
    ),
  sourceJobId: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Optional job id that prompted the memory. Omit if no specific job anchored it.'),
};

export function registerSaveCustomerMemoryTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_save_customer_memory',
    {
      title: 'Setell save customer memory',
      description:
        'Persist a single learned pattern about a customer mid-conversation. ' +
        'Use after the operator confirms a fact about how a specific customer ' +
        'works that should inform future quotes/emails (e.g. "Acme only ' +
        'responds to Wednesday emails", "Cooper always asks for net-60"). ' +
        'Three types: PRICING (rates, discount patterns), PREFERENCE (quote ' +
        'structure / special requirements), COMMUNICATION (tone, timing, ' +
        'what info they expect). The memory is read back into Boxx and the ' +
        'agent surface the next time this customer is in scope. Mutator — ' +
        'creates a CustomerMemory row.',
      annotations: {
        title: 'Setell save customer memory',
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { customerId, type, content, sourceJobId } = params as z.infer<
        z.ZodObject<typeof InputShape>
      >;
      try {
        const data = await ctx.api.post(
          `/api/mcp/v1/customers/${encodeURIComponent(customerId)}/memory`,
          SaveCustomerMemoryResponseSchema,
          {
            type,
            content,
            ...(sourceJobId ? { sourceJobId } : {}),
          },
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_save_customer_memory');
        throw err;
      }
    },
  );
}
