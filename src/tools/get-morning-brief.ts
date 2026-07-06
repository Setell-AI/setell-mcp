/**
 * setell_get_morning_brief — daily snapshot for the calling agent to
 * synthesize against.
 *
 * Per BET-3-SETELL-MCP-V0.md §6.3, the brief is a *snapshot of state*, not a
 * pre-baked summary. The calling agent (Claude Code, Claude.ai, an
 * intermediary's stack) writes the prose in its own voice. Boxx does the
 * synthesis itself in-app; this tool ships the raw counts.
 *
 * Maps to `GET /api/mcp/v1/morning-brief` on the Setell backend. All
 * underlying queries are tenant-scoped server-side.
 *
 * Payload shape:
 *   - newInboundJobs24h        — jobs created in the last 24 hours
 *   - quotesAwaitingReview     — quotes in DRAFTING (need owner approval)
 *   - quotesSentNoResponse3d   — SENT quotes with no acceptance/rejection >3d
 *   - hotProspects             — top 3 recent viewers who haven't accepted
 *   - revenueThisWeek          — total value of deals won this week
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  MorningBriefResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

export function registerGetMorningBriefTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_get_morning_brief',
    {
      title: 'Setell morning brief',
      description:
        "Today's Setell snapshot: new inbound jobs in the last 24h, " +
        'quotes awaiting review, quotes sent without response for >3 days, ' +
        "top 3 hot prospects (recent viewers who haven't accepted), and " +
        'revenue from deals won this week. Synthesize against this — the data ' +
        'is raw counts, not prose. Read-only.',
      annotations: {
        title: 'Setell morning brief',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      // No input parameters.
    },
    async () => {
      try {
        const data = await ctx.api.get('/api/mcp/v1/morning-brief', MorningBriefResponseSchema);
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_morning_brief');
        throw err;
      }
    },
  );
}
