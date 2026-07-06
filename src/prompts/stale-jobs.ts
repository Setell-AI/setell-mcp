/**
 * /setell-stale-jobs — find sent quotes that have gone cold + propose follow-ups.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.3, this prompt expands into a structured
 * triage of sent-but-not-acted-on quotes. Default stale window is 7 days; the
 * `older_than_days` arg lets a power user widen or narrow.
 *
 * Critical: the prompt directs the agent to PROPOSE follow-ups, not send them.
 * Sending requires the deliberate `setell_send_quote_followup` mutator (sprint
 * 4). This matches the in-app Boxx pattern — drafting is voiceless, sending is
 * the explicit action.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerStaleJobsPrompt(server: McpServer): void {
  server.registerPrompt(
    'setell-stale-jobs',
    {
      title: 'Find stale Setell quotes + propose follow-ups',
      description:
        "List sent quotes that haven't moved in N days. For each, attach the " +
        "customer's history and propose a follow-up that matches the " +
        "customer's preferred cadence. Does NOT send — proposing only.",
      argsSchema: {
        older_than_days: z
          .string()
          .optional()
          .describe(
            'Stale-quote threshold in days (default 7). Larger numbers ' +
              'narrow the list to the coldest quotes.',
          ),
      },
    },
    (args) => {
      const olderThanDays = parseStaleDays(args.older_than_days, 7);
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Find my stale Setell quotes (sent, no movement in ${olderThanDays}+ days) and propose follow-ups.\n\n` +
                '1. Call `setell_find_jobs` with `status: "SENT"` and ' +
                "`limit: 50`. Filter in your reasoning to those whose " +
                `last touch is older than ${olderThanDays} days.\n` +
                '2. For each stale job, attach `setell://jobs/{id}` and ' +
                '`setell://customers/{customer_id}/history`.\n' +
                '3. For each, propose:\n' +
                "   - A 1-2 sentence follow-up draft in the operator's voice " +
                '(reference `setell://settings/brand` for the voice cue).\n' +
                "   - Recommended timing — match the customer's historical " +
                'preferred cadence (e.g., "this customer historically responds ' +
                'mid-week mornings, suggest sending Tuesday 9am").\n' +
                "   - Confidence: high if you can cite specific patterns " +
                "from their history; low if you're guessing.\n" +
                "4. DO NOT call `setell_send_quote_followup`. The operator " +
                'reviews the drafts and explicitly sends the ones they like.\n\n' +
                'Voice: direct, opinionated, terse. If a quote is so cold ' +
                "it's not worth following up on, say so (\"archive — they " +
                'went with someone else 12 days ago"). Pad nothing.',
            },
          },
        ],
      };
    },
  );
}

/**
 * The MCP prompt argument transport is string-only — the SDK doesn't coerce
 * numeric args. Parse defensively and clamp to a sane range so a typo doesn't
 * silently filter every job out of the result.
 */
function parseStaleDays(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  if (parsed > 365) return 365;
  return parsed;
}
