/**
 * Tool registry for @setell/mcp.
 *
 * Each tool is a self-contained module exporting a `register()` function. The
 * registry pattern matches `src/types/boxx-tools.ts` (the in-app tool input
 * registry) so adding a new tool is one new file + one import here.
 *
 * Sprint 1 surface (read-only):
 *   - setell_get_health  — health probe + plan tier + integration status
 *   - setell_find_jobs   — filter jobs by status / customer email / limit
 *
 * Sprint 2+ will add the remaining read-only tools
 * (setell_find_customers, setell_get_revenue_summary, setell_list_templates,
 * setell_get_pricing_signal). Sprint 4 adds the two mutators.
 *
 * Every tool MUST be annotated with `readOnlyHint: true` (sprint 1 is read-only)
 * and `title` — per BET-3-SETELL-MCP-V0.md §9, missing annotations is the #1
 * directory-rejection reason. We bake them in from v0.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SetellApiClient } from '../api-client.js';
import { registerGetHealthTool } from './get-health.js';
import { registerFindJobsTool } from './find-jobs.js';
import { registerGetQuoteTool } from './get-quote.js';
import { registerFindCustomerTool } from './find-customer.js';
import { registerGetMorningBriefTool } from './get-morning-brief.js';
import { registerGetPricingSignalTool } from './get-pricing-signal.js';
import { registerProposePartsListTool } from './propose-parts-list.js';
import { registerGetAutonomyTool } from './get-autonomy.js';
import { registerSetAutonomyTool } from './set-autonomy.js';
import { registerGetShopProfileTool } from './get-shop-profile.js';
import { registerUpdateShopProfileTool } from './update-shop-profile.js';
import { registerGetCustomerBaselineTool } from './get-customer-baseline.js';
import { registerComposeQuoteTool } from './compose-quote.js';
import { registerSendQuoteTool } from './send-quote.js';
import { registerScheduleSendTool } from './schedule-send.js';
import { registerCancelScheduledSendTool } from './cancel-scheduled-send.js';
import { registerGetLearningCoverageTool } from './get-learning-coverage.js';
import { registerGetPricingCalibrationTool } from './get-pricing-calibration.js';
import { registerSaveCustomerMemoryTool } from './save-customer-memory.js';
import { registerGetCustomerMemoryTool } from './get-customer-memory.js';
import { registerGenerateQuoteTiersTool } from './generate-quote-tiers.js';
import { registerSelectQuoteTierTool } from './select-quote-tier.js';
import { registerGetQuoteTiersTool } from './get-quote-tiers.js';
import { registerGetJobMarginTool } from './get-job-margin.js';
import { registerGetMarginSummaryTool } from './get-margin-summary.js';

export interface ToolRegistrationContext {
  /** HTTP client to the Setell backend. */
  api: SetellApiClient;
}

/**
 * Register every tool in the v0 surface. Order doesn't matter — clients
 * receive the full list and pick by name.
 *
 * Sprint 1 (shipped):
 *   - setell_get_health
 *   - setell_find_jobs
 *
 * Sprint 2 (shipped):
 *   - setell_get_quote
 *   - setell_find_customer
 *   - setell_get_morning_brief
 *
 * Sprint 3 — capability expansion (this PR, post-PR-219 strategic moat):
 *   - setell_get_pricing_signal    → expose pricing-analyst to external
 *                                    agents (the frontier capability)
 *   - setell_get_autonomy / setell_set_autonomy → configure Trust mode
 *                                    from the agent surface
 *   - setell_get_customer_baseline → read learned-baseline data per
 *                                    customer (Vertical Moat read path)
 *
 * Sprint 4 — the mutators:
 *   - setell_compose_quote — draft + email + mint confirmation token
 *   - setell_send_quote    — irreversible send with pricing-analyst
 *                            pre-check + atomic QuoteSendConfirmation
 *                            guard (same safety stack as in-app)
 *
 * Sprint 5 — scheduled send:
 *   - setell_schedule_send         — stamp Quote.scheduledSendAt; cron
 *                                    picks it up on the next 5-min tick
 *   - setell_cancel_scheduled_send — clear pending schedule
 *
 * Sprint 6 — moat-visibility:
 *   - setell_get_learning_coverage — surfaces the operator's vertical-
 *                                    moat metrics (sample-size depth +
 *                                    maturityTier voice anchor)
 *   - setell_get_pricing_calibration — the pricing report card: every
 *                                      draft-time prediction joined to
 *                                      its real outcome (calibration,
 *                                      win curve, verdict×outcome)
 *
 * Sprint 7 — customer-memory write path:
 *   - setell_save_customer_memory — persist a single operator-confirmed
 *                                   pattern about a customer mid-
 *                                   conversation (PRICING / PREFERENCE
 *                                   / COMMUNICATION). Closes the write
 *                                   half of BOXX-GAP §3.3.
 *
 * Sprint 8 (this PR) — customer-memory read path:
 *   - setell_get_customer_memory  — list every CustomerMemory row for
 *                                   a (operator, customer) pair so the
 *                                   calling agent can audit / decide
 *                                   what to overwrite before calling
 *                                   setell_save_customer_memory.
 *                                   Closes the read half of BOXX-GAP
 *                                   §3.3 on the MCP surface (the in-
 *                                   app surface gets the symmetric
 *                                   `get_customer_memory` Boxx tool
 *                                   in the same PR).
 *
 * Sprint 9 — good/better/best tiers ("three ways to win the work"):
 *   - setell_generate_quote_tiers — GOOD/BEST generated around the job's
 *                                   current quote; BETTER mirrors it
 *                                   verbatim. Stores options only.
 *   - setell_select_quote_tier    — materialize the chosen tier into the
 *                                   active quote via the revision engine
 *                                   (BETTER = no-op).
 *   - setell_get_quote_tiers      — list option groups + baseIsCurrent.
 *
 * Sprint 10 — realized margin (the retrospective half of unit economics):
 *   - setell_get_job_margin       — what the operator ACTUALLY made on a
 *                                   job; marginPct withheld below the
 *                                   honesty floor. Operator-only data.
 *   - setell_get_margin_summary   — margin across recent WON jobs vs the
 *                                   operator's target; worst jobs/types.
 */
export function registerAllTools(server: McpServer, ctx: ToolRegistrationContext): void {
  registerGetHealthTool(server, ctx);
  registerFindJobsTool(server, ctx);
  registerGetQuoteTool(server, ctx);
  registerFindCustomerTool(server, ctx);
  registerGetMorningBriefTool(server, ctx);
  registerGetPricingSignalTool(server, ctx);
  registerProposePartsListTool(server, ctx);
  registerGetAutonomyTool(server, ctx);
  registerSetAutonomyTool(server, ctx);
  registerGetShopProfileTool(server, ctx);
  registerUpdateShopProfileTool(server, ctx);
  registerGetCustomerBaselineTool(server, ctx);
  registerComposeQuoteTool(server, ctx);
  registerSendQuoteTool(server, ctx);
  registerScheduleSendTool(server, ctx);
  registerCancelScheduledSendTool(server, ctx);
  registerGetLearningCoverageTool(server, ctx);
  registerGetPricingCalibrationTool(server, ctx);
  registerSaveCustomerMemoryTool(server, ctx);
  registerGetCustomerMemoryTool(server, ctx);
  registerGenerateQuoteTiersTool(server, ctx);
  registerSelectQuoteTierTool(server, ctx);
  registerGetQuoteTiersTool(server, ctx);
  registerGetJobMarginTool(server, ctx);
  registerGetMarginSummaryTool(server, ctx);
}
