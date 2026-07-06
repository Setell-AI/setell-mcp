/**
 * /setell-pricing-check — pre-send pricing sanity check using
 * `setell_get_pricing_signal`.
 *
 * Leverages PR #225 + #228: the calling agent runs Setell's pricing-
 * analyst on a job before sending, surfaces the verdict in the
 * operator's voice, and recommends concrete next steps (counter, send,
 * hold) based on the analyst's reasoning.
 *
 * The prompt explicitly forbids calling `setell_send_quote` — this is
 * the pre-send check, not the send. Operator picks the action.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPricingCheckPrompt(server: McpServer): void {
  server.registerPrompt(
    'setell-pricing-check',
    {
      title: "Pre-send pricing-analyst check for a Setell job",
      description:
        "Run Setell's pricing-analyst on a job before sending. Surfaces the " +
        "verdict (PASS / WARN / FLAG), the analyst's reasoning, any " +
        'recommended counter-amount, and which comparable layer fired ' +
        "(customer-learned / operator-wide / similar-jobs / industry " +
        "benchmark). Does NOT send — the operator picks the next action.",
      argsSchema: {
        job_id: z
          .string()
          .min(1)
          .max(64)
          .describe('The job id to check pricing on. Find via setell_find_jobs if unknown.'),
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
                `Pre-send pricing check for job \`${jobId}\`.\n\n` +
                '1. Call `setell_get_pricing_signal` with `jobId: "' + jobId + '"`.\n' +
                '2. Narrate the result in the operator\'s voice:\n' +
                '   - For PASS: a single confident sentence (e.g. "Priced in band, ' +
                'fine to send").\n' +
                '   - For WARN: surface the analyst\'s reasoning verbatim. ' +
                'Reference the comparable layer that fired so the operator ' +
                'knows what the verdict is based on.\n' +
                '   - For FLAG: surface the reasoning + the recommended counter ' +
                '(if present) prominently. Make clear this is a meaningful gap, ' +
                'not a nitpick.\n' +
                '3. End with concrete next-step options, ordered:\n' +
                '   - **Counter** at the recommended amount (if the analyst gave one)\n' +
                '   - **Send anyway** — call `setell_send_quote` with `acknowledgePricingWarning: true` after explicit operator confirmation\n' +
                '   - **Revise** the quote line items before re-sending\n' +
                '4. DO NOT call `setell_send_quote` in this conversation. ' +
                'The operator reviews this analysis and decides.\n\n' +
                'Voice: direct, opinionated, terse. Trust the analyst — its ' +
                "verdict is based on the operator's own signed-quote history " +
                '(or industry benchmark cold-start). Pad nothing.',
            },
          },
        ],
      };
    },
  );
}
