/**
 * setell_compose_quote — Sprint 4 mutator (idempotent-ish: each call
 * generates a fresh draft + token; the previous draft is overwritten on
 * the quote row but old tokens stay valid until expiry).
 *
 * Composes the quote email body (AI-drafted in the operator's brand
 * voice) AND mints a `QuoteSendConfirmation` token in one round-trip.
 * Returns the preview shape the calling agent narrates to the operator;
 * the operator confirms; agent calls `setell_send_quote` with the
 * returned `confirmationToken`.
 *
 * Token binding: (userId, jobId, quoteId, quoteVersion,
 * normalizedRecipientEmail). 15-minute TTL. Single-use. Any drift
 * between compose and send fails the atomic guard — the safety floor.
 *
 * Plan-gated: composeQuoteEmail is a paid Claude call; free / cap-hit
 * users get an `ApiError(plan_required)` surfaced via the standard
 * upgrade prompt.
 *
 * Maps to POST /api/mcp/v1/quotes/compose.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  ComposeQuoteResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe('The job id whose latest quote should be composed for sending.'),
  tone: z
    .enum(['formal', 'friendly', 'brief'])
    .optional()
    .describe(
      "Email tone. Default 'friendly'. The composer always uses the operator's brand voice from UserSettings; tone controls the cadence.",
    ),
  customInstructions: z
    .string()
    .max(1000)
    .optional()
    .describe(
      'Optional one-paragraph instructions for the AI composer (e.g. "mention the customer prefers Sunday meetings"). Stays under 1000 chars.',
    ),
  recipientEmail: z
    .string()
    .email()
    .max(255)
    .optional()
    .describe(
      "Override the recipient. Defaults to the customer's email on file. If set, MUST match what setell_send_quote uses — drift between compose and send invalidates the token.",
    ),
};

export function registerComposeQuoteTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_compose_quote',
    {
      title: 'Compose a Setell quote email',
      description:
        "Draft the quote email body (AI-generated in the operator's brand voice) AND mint a single-use confirmation token bound to this quote version + recipient. Returns: " +
        '`quote` (id, version, total, lineItems), `email` (to, subject, bodySnippet), `portalUrl`, `customer`, `confirmationToken`, `confirmationExpiresAt`, `recipientOverride`. ' +
        "Narrate the preview to the operator; on their explicit approval call setell_send_quote with the token verbatim. The token is single-use, expires in 15 minutes, and binds the specific quote version + recipient — any revision or recipient change requires re-composing. Plan-gated (counts against the operator's monthly AI quote quota).",
      annotations: {
        title: 'Compose a Setell quote email',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const body = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.post(
          '/api/mcp/v1/quotes/compose',
          ComposeQuoteResponseSchema,
          body,
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_compose_quote');
        throw err;
      }
    },
  );
}
