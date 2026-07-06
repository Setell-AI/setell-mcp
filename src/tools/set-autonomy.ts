/**
 * setell_set_autonomy — change one (actionClass, mode) pair.
 *
 * Mutating tool. Per CLAUDE.md *Product Surface Architecture* parity: every
 * capability is reachable from every surface. Setting autonomy in Settings
 * UI and setting it via this MCP tool both write to the same
 * `UserAutonomyPolicy` row.
 *
 * Modes:
 *   - WATCH: Boxx pauses on every WARN/FLAG pricing-analyst verdict.
 *            Allowed for all plans (downgrade path).
 *   - TRUST: WARN auto-proceeds with a surfaced note; FLAG still asks.
 *            Requires Business or Pro.
 *   - AUTO:  WARN auto-proceeds silently; FLAG still asks (load-bearing).
 *            Requires Business or Pro.
 *
 * The atomic correctness guards on send_quote (QuoteSendConfirmation
 * token, single-use updateMany) stay in force regardless of mode.
 *
 * Maps to POST /api/mcp/v1/autonomy { actionClass, mode }.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  AutonomyActionClassSchema,
  AutonomyModeSchema,
  AutonomyResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  actionClass: AutonomyActionClassSchema.describe(
    'The action class to configure. Currently only `send_quote` is supported.',
  ),
  mode: AutonomyModeSchema.describe(
    'WATCH (default — pause on every pushback), TRUST (auto-proceed on WARN with a note, ask on FLAG), or AUTO (auto-proceed on WARN silently, ask on FLAG). TRUST/AUTO require Business or Pro.',
  ),
};

export function registerSetAutonomyTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_set_autonomy',
    {
      title: 'Set Setell autonomy mode',
      description:
        "Set the operator's autonomy mode for one action class. WATCH " +
        'pauses on every WARN/FLAG pricing-analyst verdict (maximum HITL); ' +
        'TRUST auto-proceeds on WARN with a surfaced note and asks on FLAG; ' +
        'AUTO auto-proceeds on WARN silently. FLAG always asks regardless ' +
        'of mode. Atomic correctness guards (preview-then-confirm tokens, ' +
        'single-use sends) stay in force in every mode. Confirm with the ' +
        'operator before flipping a mode on their behalf — this changes ' +
        'how Boxx behaves on future sends.',
      annotations: {
        title: 'Set Setell autonomy mode',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const body = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.post('/api/mcp/v1/autonomy', AutonomyResponseSchema, body);
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_set_autonomy');
        throw err;
      }
    },
  );
}
