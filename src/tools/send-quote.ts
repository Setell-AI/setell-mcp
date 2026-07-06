/**
 * setell_send_quote — Sprint 4 mutator. The most consequential tool in
 * the @setell/mcp surface — irreversibly sends a doorbell email to the
 * customer.
 *
 * Same safety stack as the in-app `send_quote` Boxx tool:
 *   1. Pricing-analyst pre-check (4-layer comparable hierarchy) →
 *      verdict + autonomy mode → allow / ask. On `ask`, returns 409
 *      with a `pricing_pushback` code + verdict + recommended counter
 *      + retryWith hint. The calling agent surfaces the pushback to
 *      the operator and only retries with `acknowledgePricingWarning:
 *      true` on the operator's explicit confirmation. Server-side
 *      verdict-recording defends against fabricated ack flags.
 *   2. Atomic `QuoteSendConfirmation.updateMany` consume — same WHERE
 *      tuple as in-app (userId / jobId / quoteId / quoteVersion /
 *      recipientEmail / usedAt:null / not-expired). Zero rows = reject.
 *   3. sendOutboundEmail dispatcher (DKIM-delegated Resend or
 *      SETELL_DEFAULT per operator's UserSettings).
 *   4. Atomic status transitions (Quote SENT + prior SUPERSEDED + Job
 *      SENT) in a $transaction.
 *
 * On pricing_pushback, the `ApiError` carries the message
 * (errorResultFromApi renders it via the `default` case). To get the
 * full structured pushback (verdict, recommendedAmount, layer) the
 * calling agent reads the JSON returned by the structuredContent on
 * the failed-result block — clients that don't support structuredContent
 * still see the human-readable text.
 *
 * Maps to POST /api/mcp/v1/quotes/send.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import { SendQuoteResponseSchema, errorResultFromApi, successResultFromJson } from './_shared.js';

const InputShape = {
  jobId: z.string().min(1).max(64).describe('The job id whose latest quote to send.'),
  confirmationToken: z
    .string()
    .min(20)
    .max(64)
    .describe(
      'The confirmation token returned by `setell_compose_quote`. Single-use, 15-minute TTL, bound to a specific quote version + recipient. Pass verbatim.',
    ),
  recipientEmail: z
    .string()
    .email()
    .max(255)
    .optional()
    .describe(
      "Optional recipient override. MUST match the recipient used by setell_compose_quote — any drift invalidates the token. Defaults to the customer's email on file.",
    ),
  acknowledgePricingWarning: z
    .boolean()
    .optional()
    .describe(
      'Set to true ONLY on a retry after the pricing-analyst returned a pushback (HTTP 409 / code: pricing_pushback) AND the operator explicitly confirmed. The server validates that a verdict was recorded for this token before honoring the flag — fabricating it on a clean token has no effect.',
    ),
};

export function registerSendQuoteTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_send_quote',
    {
      title: 'Send a Setell quote',
      description:
        'IRREVERSIBLY sends the doorbell email to the customer (V2 outbound via DKIM-delegated Resend or SETELL_DEFAULT). Requires a valid confirmationToken returned by `setell_compose_quote`. ' +
        "Runs the pricing-analyst pre-check first — if the quote is materially off-band, returns 409 with `code: pricing_pushback`, a verdict (WARN / FLAG), the analyst's reasoning, an optional recommendedAmount counter, and the comparable layer that fired. Surface the pushback to the operator verbatim; retry the SAME call with `acknowledgePricingWarning: true` only after explicit operator confirmation. " +
        'The atomic QuoteSendConfirmation guard rejects sends after a revision, recipient drift, expired/used tokens, and cross-tenant replay — the safety floor stays load-bearing.',
      annotations: {
        title: 'Send a Setell quote',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const body = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        // noRetry: true — per AGENTS.md "NEVER retry: email sends".
        // The server-side handler atomically consumes a
        // QuoteSendConfirmation token THEN dispatches outbound email. A
        // retry after the email left the building (but before the HTTP
        // response arrived) would see the consumed token and return 409
        // CONFIRMATION_INVALID — agents surface that as "compose a
        // fresh token; the prior send failed," and the operator
        // triggers a duplicate email by following the agent's advice.
        // Caught by Greptile P1 on PR #225.
        const data = await ctx.api.post('/api/mcp/v1/quotes/send', SendQuoteResponseSchema, body, {
          noRetry: true,
        });
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_send_quote');
        throw err;
      }
    },
  );
}
