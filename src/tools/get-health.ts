/**
 * setell_get_health — verify the MCP connection + show plan + integration state.
 *
 * Maps to `GET /api/mcp/v1/health` on the Setell backend. Always read-only,
 * idempotent, and zero-cost. Designed to be the "first call" so the calling
 * agent can confirm the connection is healthy before invoking other tools.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.1, this tool also serves as the cheapest
 * possible plan-gate probe — if the user is not on Pro, the 402 surfaces as
 * a clean text result with the upgrade URL.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import { HealthResponseSchema, errorResultFromApi, successResultFromJson } from './_shared.js';

export function registerGetHealthTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_get_health',
    {
      title: 'Setell connection health',
      description:
        'Check the Setell connection status. Returns the connected userId (opaque), ' +
        'the effective plan tier, and whether Gmail and QuickBooks are connected. ' +
        'Call this first if any other Setell tool fails — it isolates auth/plan ' +
        'problems from data-shape problems.',
      annotations: {
        title: 'Setell connection health',
        readOnlyHint: true,
        // Hint for clients that distinguish destructive vs. open-world tools.
        destructiveHint: false,
        openWorldHint: false,
      },
      // No input parameters — empty inputSchema means "tool takes no args".
    },
    async () => {
      try {
        const health = await ctx.api.get('/api/mcp/v1/health', HealthResponseSchema);
        return successResultFromJson(health);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_health');
        throw err;
      }
    },
  );
}
