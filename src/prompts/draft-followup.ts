/**
 * /setell-draft-followup — draft a follow-up for a specific job WITHOUT sending.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.3, this is the load-bearing prompt that proves
 * the design separation between *drafting* (passive, voiceless) and *sending*
 * (deliberate, mutating, gated by autonomy mode).
 *
 * The prompt explicitly tells the agent: DO NOT call `setell_send_quote_followup`.
 * The send is a separate explicit action the user takes after reviewing the
 * draft. This matches the in-app Boxx pattern (preview_quote → user confirms →
 * send_quote with confirmationToken).
 *
 * If a future agent or prompt template wants "draft and send" as one action,
 * it should be a SECOND distinct slash command (e.g., `/setell-auto-followup`)
 * gated on Trust-mode autonomy at the backend. Drafting and sending must stay
 * different verbs on different surfaces.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerDraftFollowupPrompt(server: McpServer): void {
  server.registerPrompt(
    'setell-draft-followup',
    {
      title: 'Draft a Setell follow-up (no send)',
      description:
        "Draft a follow-up email for a specific job in the operator's voice. " +
        'Returns the draft only — does NOT send. The send is a separate ' +
        'deliberate action via setell_send_quote_followup.',
      argsSchema: {
        job_id: z
          .string()
          .min(1)
          .max(64)
          .describe(
            "The Setell job id. Available from `setell_find_jobs` results or " +
              'the `setell://jobs/{id}` resource URI.',
          ),
      },
    },
    (args) => {
      const jobId = args.job_id.trim();
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Draft a follow-up for Setell job ${jobId}.\n\n` +
                `1. Attach \`setell://jobs/${jobId}\` for the job + customer + ` +
                'quote context.\n' +
                `2. Attach \`setell://customers/{customer_id}/history\` (the ` +
                "customer id is on the job resource) so you can match the " +
                "customer's historical voice patterns.\n" +
                "3. Attach `setell://settings/brand` for the operator's voice " +
                "+ signature.\n" +
                "4. Draft a follow-up email (3-6 sentences). Match:\n" +
                "   - The operator's voice (terse, opinionated, trade-savvy " +
                "if applicable).\n" +
                "   - The customer's historical cadence (how long since last " +
                'touch, what they responded to before).\n' +
                "   - The job's current state — if a quote was sent, " +
                "reference it; if revisions are pending, address them.\n" +
                "5. Format the draft as:\n" +
                "   Subject: [your subject line]\n" +
                "   ---\n" +
                "   [body]\n" +
                "   ---\n" +
                "   Recommended send time: [time + reasoning]\n\n" +
                "DO NOT CALL `setell_send_quote_followup`. This prompt is " +
                "draft-only. The operator reviews the draft, edits if needed, " +
                'then explicitly invokes the send tool when satisfied. ' +
                'Sending without explicit confirmation breaks the autonomy ' +
                'contract — the customer relationship is the operator\'s, ' +
                'not the agent\'s, to put at risk.',
            },
          },
        ],
      };
    },
  );
}
