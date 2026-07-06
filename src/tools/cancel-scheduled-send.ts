/**
 * setell_cancel_scheduled_send — Sprint 5 mutator. Clears a pending
 * scheduled send on the latest quote of a job. No-op if no schedule is
 * pending (returns success with previouslyScheduledFor: null).
 *
 * Race window note: if the scheduled-sends cron is mid-claim when this
 * fires, the cron's atomic updateMany (which requires scheduledSendAt
 * to still equal the value the cron read) will affect 0 rows and the
 * cron skips the quote. In other words, a cancel-during-claim races to
 * the same outcome — the quote is not re-sent. The cron's behavior is
 * unchanged.
 *
 * Maps to POST /api/mcp/v1/quotes/schedule with scheduledSendAt: null.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  CancelScheduledSendResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe('The job id whose latest quote should have its pending schedule cleared.'),
};

export function registerCancelScheduledSendTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_cancel_scheduled_send',
    {
      title: 'Cancel a scheduled Setell quote send',
      description:
        'Clear a pending scheduled send on the latest quote of a job. Returns the previous schedule time (or null if none was pending). No-op if no schedule is pending. The cron will skip the quote on its next tick regardless — the atomic claim requires scheduledSendAt to match what the cron read, which a cancel invalidates.',
      annotations: {
        title: 'Cancel a scheduled Setell quote send',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { jobId } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.post(
          '/api/mcp/v1/quotes/schedule',
          CancelScheduledSendResponseSchema,
          { jobId, scheduledSendAt: null },
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_cancel_scheduled_send');
        throw err;
      }
    },
  );
}
