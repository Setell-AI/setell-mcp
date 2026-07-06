/**
 * setell_get_autonomy — list the caller's per-action-class autonomy modes.
 *
 * Reflects whatever the operator currently has configured in
 * `UserAutonomyPolicy` (PR #219 commit 1). Currently only `send_quote`
 * ships as a configurable action class; future additions appear
 * automatically once they're listed in AUTONOMY_ACTION_CLASSES on the
 * backend.
 *
 * Returns `canConfigure: false` for free-tier users — they can read their
 * own modes (always WATCH absent a row), but setell_set_autonomy with a
 * non-WATCH mode will 402.
 *
 * Read-only. Maps to GET /api/mcp/v1/autonomy.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import { AutonomyResponseSchema, errorResultFromApi, successResultFromJson } from './_shared.js';

export function registerGetAutonomyTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_get_autonomy',
    {
      title: 'Setell autonomy modes',
      description:
        "Show the operator's per-action-class autonomy modes. " +
        'For each action class (currently: send_quote), returns the mode: ' +
        'WATCH (Boxx pauses on WARN+FLAG pricing verdicts), TRUST ' +
        '(auto-proceed on WARN with a surfaced note, ask on FLAG), or AUTO ' +
        '(auto-proceed on WARN silently, ask on FLAG). FLAG always asks ' +
        'regardless of mode — load-bearing safety floor. Also returns ' +
        '`canConfigure` indicating whether the operator is on a paid plan ' +
        '(non-WATCH modes are Business+/Pro). Read-only.',
      annotations: {
        title: 'Setell autonomy modes',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const data = await ctx.api.get('/api/mcp/v1/autonomy', AutonomyResponseSchema);
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_autonomy');
        throw err;
      }
    },
  );
}
