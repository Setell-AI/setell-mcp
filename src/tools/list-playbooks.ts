/**
 * setell_list_playbooks — the curated trade-playbook catalog + applied state.
 *
 * Playbooks are Setell-curated trade starter-configs (machine shop, HVAC,
 * landscaping & outdoor, general contractor) that shape agent BEHAVIOR:
 * intake guidance for the drafter, structure-only starter quote templates,
 * and setup nudges. A playbook NEVER contains a price — pricing comes from
 * the operator's own data (CLAUDE.md "Vertical Moat" doctrine).
 *
 * Read-only. Maps to GET /api/mcp/v1/playbooks.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  PlaybooksListResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

export function registerListPlaybooksTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_list_playbooks',
    {
      title: 'Setell trade playbooks',
      description:
        "List Setell's curated trade playbooks — behavior starter-configs " +
        '(intake guidance, structure-only starter quote templates, setup ' +
        'suggestions; never prices) — and which one the operator has ' +
        'applied. Use before setell_apply_playbook. Read-only.',
      annotations: {
        title: 'Setell trade playbooks',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const data = await ctx.api.get('/api/mcp/v1/playbooks', PlaybooksListResponseSchema);
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_list_playbooks');
        throw err;
      }
    },
  );
}
