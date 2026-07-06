/**
 * /setell-weekly-revenue — trailing 7-day revenue summary with week-over-week deltas.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.3, this is the "Monday morning" prompt — the
 * intermediary (bookkeeper / fractional CFO) or the operator picks it to see
 * the week at a glance. Composes the morning-brief resource with the revenue
 * tool for a synthesized one-paragraph answer.
 *
 * Implementation note: `setell_get_revenue_summary` is a sprint 3+ tool that
 * may not exist yet — the prompt still works because the calling agent can
 * fall back to `setell://insights/morning-brief` alone. We surface the tool
 * name to nudge the agent toward the deeper data when it lands.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerWeeklyRevenuePrompt(server: McpServer): void {
  server.registerPrompt(
    'setell-weekly-revenue',
    {
      title: 'Weekly Setell revenue summary',
      description:
        'Produce a one-paragraph trailing-7-day revenue summary: signed, ' +
        'paid, in-pipeline, week-over-week deltas, the largest open ' +
        'opportunity. Flag anomalies.',
      // No arguments — the window is fixed at trailing-7-days for v0.
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              "Give me this week's Setell revenue snapshot.\n\n" +
              '1. Attach `setell://insights/morning-brief` for current ' +
              'pipeline state.\n' +
              "2. If `setell_get_revenue_summary` is available, call it with " +
              "`period: \"7d\"` and `compareTo: \"prior_7d\"`. If the tool " +
              "isn't registered yet, work from the morning-brief data alone " +
              "and note that the deeper breakdown isn't available.\n" +
              "3. Produce ONE paragraph (3-5 sentences) covering:\n" +
              "   - Signed this week vs last week ($, delta, % change)\n" +
              "   - Paid this week vs last week\n" +
              '   - Open pipeline ($ value, # of quotes awaiting customer)\n' +
              "   - The largest single open opportunity (customer + amount + status)\n" +
              "   - Any anomalies — unusually high reject rate, a customer " +
              "going cold mid-funnel, an invoice past due.\n\n" +
              "Voice: terse, owner-facing, no padding. If the week is flat or " +
              "down, say so plainly — don't manufacture a silver lining. If " +
              "you don't have data to answer (e.g., morning-brief is empty " +
              "because the user is new), say that and stop.",
          },
        },
      ],
    }),
  );
}
