/**
 * /setell-triage-inbox — triage new inbound jobs from the last 24 hours.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.3, this is the "morning triage" entry point —
 * the user picks the slash command, the prompt expands into a structured user
 * message that tells the calling agent how to compose tools + resources to
 * produce a triage view.
 *
 * The prompt is intentionally directive: it names the exact tools to call and
 * the exact synthesis shape. We don't want every agent's interpretation to
 * drift — the slash command's value IS its consistency across agents and
 * sessions.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerTriageInboxPrompt(server: McpServer): void {
  server.registerPrompt(
    'setell-triage-inbox',
    {
      title: 'Triage new Setell inbox',
      description:
        'Surface every new job from the last 24 hours, summarize the ask, ' +
        'propose a price band from pricing history, and recommend NEW vs ' +
        'needs-clarification. Prioritized by inferred customer importance.',
      // No arguments — this prompt always operates on the trailing 24h window.
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Triage my new Setell inbox.\n\n' +
              '1. Call `setell_find_jobs` with `status: "NEW"` and `limit: 25` ' +
              'to surface every job created in the last 24 hours.\n' +
              '2. For each job, attach `setell://jobs/{id}` so you have the ' +
              'full customer + email context.\n' +
              '3. For each, summarize:\n' +
              '   - Customer name + ask (1 sentence)\n' +
              '   - Proposed price band — pivot to ' +
              '`setell_get_pricing_signal` with the inferred description ' +
              "if available; otherwise note 'no historical signal'.\n" +
              "   - Your recommendation: NEW (ready to draft) or " +
              "NEEDS_CLARIFICATION (questions to ask the customer first).\n" +
              '4. Sort the output by inferred customer importance — repeat ' +
              'customers, larger jobs, faster turnarounds first.\n\n' +
              "Use Boxx's voice: direct, opinionated, terse. Don't bury the " +
              'lede in hedges. If a job is clearly off-vertical or out of ' +
              "scope, flag it explicitly — don't pad the list.",
          },
        },
      ],
    }),
  );
}
