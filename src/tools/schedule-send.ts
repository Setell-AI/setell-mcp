/**
 * setell_schedule_send — Sprint 5 mutator. Schedules the latest quote
 * on a job to send at a future time. The scheduled-sends cron picks it
 * up on the next 5-minute tick at-or-after `scheduledSendAt` and
 * dispatches via the canonical send pipeline.
 *
 * Important: the cron does NOT re-run the pricing-analyst — by the time
 * a send is scheduled, the operator has explicitly approved it. If a
 * pricing sanity-check matters before scheduling, the calling agent
 * should call `setell_get_pricing_signal` first and surface the verdict
 * to the operator.
 *
 * The schedule is bounded: 1 minute to 30 days in the future.
 *
 * Maps to POST /api/mcp/v1/quotes/schedule (with non-null scheduledSendAt).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  ScheduleSendResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The job id whose latest quote should be scheduled. The cron operates on the latest quote version, matching the in-app schedule_send behavior.',
    ),
  scheduledSendAt: z
    .string()
    .datetime({ message: 'scheduledSendAt must be an ISO 8601 timestamp' })
    .describe(
      'ISO 8601 datetime (e.g. "2026-05-23T13:00:00Z") in the future. Must be 1 minute to 30 days from now. Confirm the exact time with the operator before calling — once scheduled, the cron will dispatch unattended.',
    ),
};

export function registerScheduleSendTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_schedule_send',
    {
      title: 'Schedule a Setell quote send',
      description:
        'Schedule the latest quote on a job to be sent automatically at a future time. The send fires via the canonical pipeline at the next 5-minute cron tick at-or-after scheduledSendAt. Bounds: 1 minute to 30 days in the future. ' +
        'IMPORTANT: the scheduled send is NOT re-checked by the pricing-analyst (the operator has already approved). If pricing certainty matters, call setell_get_pricing_signal first and surface the verdict before scheduling. ' +
        'Use setell_cancel_scheduled_send to cancel a pending schedule before it fires.',
      annotations: {
        title: 'Schedule a Setell quote send',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { jobId, scheduledSendAt } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.post('/api/mcp/v1/quotes/schedule', ScheduleSendResponseSchema, {
          jobId,
          scheduledSendAt,
        });
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_schedule_send');
        throw err;
      }
    },
  );
}
