/**
 * /setell-send-quote — orchestrate the full compose → preview → confirm
 * → send flow on a single job.
 *
 * Uses the PR #225 mutators (setell_compose_quote + setell_send_quote)
 * plus the PR #228 pricing-signal pre-check. Walks the operator
 * through the deliberate three-step send:
 *   1. compose + mint confirmation token
 *   2. pricing-analyst pre-check + narrate
 *   3. operator confirms → send (with `acknowledgePricingWarning: true`
 *      only if the analyst flagged + operator approved)
 *
 * Load-bearing safety: the prompt explicitly directs the agent NOT to
 * call `setell_send_quote` until the operator confirms in the same
 * conversation turn. The QuoteSendConfirmation atomic guard is the
 * server-side floor — this prompt makes the client-side flow match.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerSendQuotePrompt(server: McpServer): void {
  server.registerPrompt(
    'setell-send-quote',
    {
      title: 'Walk through a Setell quote send with confirmation',
      description:
        'Orchestrate the full compose → pricing-check → confirm → send ' +
        'flow on a job. Drafts the email, narrates the preview, runs ' +
        'the pricing-analyst, and only sends after explicit operator ' +
        'confirmation in the same conversation. The send is IRREVERSIBLE; ' +
        'this prompt ensures the operator sees everything before the ' +
        'doorbell email goes out.',
      argsSchema: {
        job_id: z
          .string()
          .min(1)
          .max(64)
          .describe('The job id whose latest quote should be sent. Find via setell_find_jobs if unknown.'),
      },
    },
    (args) => {
      const jobId = args.job_id;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Walk me through sending the latest quote on job \`${jobId}\`.\n\n` +
                '1. Call `setell_compose_quote` with `jobId: "' + jobId + '"`. ' +
                "Show me the resulting preview: quote total, line items, " +
                'recipient email, and the email body snippet.\n' +
                '2. Call `setell_get_pricing_signal` with `jobId: "' + jobId + '"` ' +
                "to check whether the analyst flags the price.\n" +
                '   - If verdict is **PASS**: tell me the price is in band; ' +
                'move to step 3.\n' +
                '   - If verdict is **WARN** or **FLAG**: surface the analyst\'s ' +
                "reasoning verbatim and the recommended counter (if any). " +
                'Ask me whether to (a) send anyway, (b) counter at the ' +
                'recommended amount before sending, or (c) cancel. STOP ' +
                'and wait for my answer.\n' +
                '3. After my explicit confirmation (PASS path) or my override ' +
                "(WARN/FLAG path), call `setell_send_quote` with:\n" +
                '   - The `confirmationToken` from step 1\n' +
                "   - `acknowledgePricingWarning: true` ONLY if step 2 was " +
                'WARN or FLAG and I explicitly said "send anyway"\n' +
                "4. Report what was sent: recipient, total, quoteVersion, " +
                'timestamp. If `partialFailure: status_update_failed`, ' +
                'surface that honestly — the email IS out, but the ' +
                'in-app status needs a manual nudge.\n\n' +
                'Critical: do NOT call `setell_send_quote` before my ' +
                "explicit confirmation in step 3. The 15-minute token " +
                "TTL is plenty of time to wait.\n\n" +
                'Voice: direct, opinionated, terse. Trust the analyst, ' +
                'but respect that the final decision is mine.',
            },
          },
        ],
      };
    },
  );
}
