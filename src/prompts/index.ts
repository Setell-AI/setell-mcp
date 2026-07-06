/**
 * Prompt registry for @setell/mcp.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.3, prompts are *templated user messages* —
 * the user picks `/setell-triage-inbox` in Claude Code, and the prompt
 * expands into a structured message (with optional argument substitution)
 * that the user reviews and submits.
 *
 * The five Sprint 3 prompts:
 *   - setell-triage-inbox     — new inbound jobs from last 24h
 *   - setell-stale-jobs       — sent quotes gone cold + follow-up drafts
 *   - setell-weekly-revenue   — trailing 7-day revenue summary
 *   - setell-customer-history — load full customer context
 *   - setell-draft-followup   — draft (NOT send) a follow-up for a job
 *
 * Naming convention: kebab-case to match the slash-command UX. The SDK
 * accepts any string; Claude Code renders these as `/setell-triage-inbox`
 * etc. in its slash-command picker.
 *
 * Drafting vs sending split is load-bearing: `/setell-draft-followup`
 * explicitly forbids calling the send tool. Sending requires a separate
 * deliberate user action via `setell_send_quote_followup` (sprint 4).
 * This mirrors the in-app Boxx preview → confirm → send pattern.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTriageInboxPrompt } from './triage-inbox.js';
import { registerStaleJobsPrompt } from './stale-jobs.js';
import { registerWeeklyRevenuePrompt } from './weekly-revenue.js';
import { registerCustomerHistoryPrompt } from './customer-history.js';
import { registerDraftFollowupPrompt } from './draft-followup.js';
import { registerPricingCheckPrompt } from './pricing-check.js';
import { registerMoatCoveragePrompt } from './moat-coverage.js';
import { registerSendQuotePrompt } from './send-quote.js';

/**
 * Register every prompt in the surface. Order doesn't matter — clients
 * receive the full list via `prompts/list` and pick by name.
 *
 * Sprint 3 prompts (shipped):
 *   - setell-triage-inbox      — new inbound jobs from last 24h
 *   - setell-stale-jobs        — sent quotes gone cold + follow-up drafts
 *   - setell-weekly-revenue    — trailing 7-day revenue summary
 *   - setell-customer-history  — load full customer context
 *   - setell-draft-followup    — draft (NOT send) a follow-up
 *
 * Sprint 6 prompts (this PR — round-out for the moat + mutator tools):
 *   - setell-pricing-check     — pre-send pricing-analyst check
 *                                (uses setell_get_pricing_signal)
 *   - setell-moat-coverage     — narrate vertical-moat depth
 *                                (uses setell_get_learning_coverage)
 *   - setell-send-quote        — orchestrated compose → check → confirm
 *                                → send (uses setell_compose_quote +
 *                                setell_get_pricing_signal +
 *                                setell_send_quote with the same load-
 *                                bearing safety floor as in-app)
 *
 * Drafting vs sending split stays load-bearing: `/setell-draft-followup`
 * forbids the send tool, and `/setell-send-quote` explicitly requires
 * operator confirmation between the pricing-check and the send.
 *
 * Prompts have no per-request context object; if a future prompt needs
 * the API client (e.g., to pre-fetch a list at prompts/list time
 * rather than at expansion time), thread it through here the same way
 * `ToolRegistrationContext` does for tools.
 */
export function registerAllPrompts(server: McpServer): void {
  registerTriageInboxPrompt(server);
  registerStaleJobsPrompt(server);
  registerWeeklyRevenuePrompt(server);
  registerCustomerHistoryPrompt(server);
  registerDraftFollowupPrompt(server);
  registerPricingCheckPrompt(server);
  registerMoatCoveragePrompt(server);
  registerSendQuotePrompt(server);
}
