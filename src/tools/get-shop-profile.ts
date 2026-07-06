/**
 * setell_get_shop_profile — read the operator's shop capability sheet.
 *
 * The profile (machines, finishing in-house/outsourced, materials commonly
 * run, how-we-run note) is the context Setell's drafter and pricing analyst
 * judge complexity / cycle-time / finish fit from — DATA for the one
 * adaptive engine, never a per-machine calculator (CLAUDE.md "Vertical
 * Moat"). Empty sheet when the operator hasn't filled it in.
 *
 * Read-only. Maps to GET /api/mcp/v1/shop-profile.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import { ShopProfileResponseSchema, errorResultFromApi, successResultFromJson } from './_shared.js';

export function registerGetShopProfileTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_get_shop_profile',
    {
      title: 'Setell shop profile',
      description:
        "Read the operator's shop profile — the capability sheet quotes are " +
        'judged against: machines (name × count, envelope notes), finishing ' +
        'processes (in-house vs outsourced), materials commonly run, and a ' +
        'free-form how-we-run note. Returns an empty sheet when the operator ' +
        "hasn't filled it in — offer setell_update_shop_profile when that's " +
        'blocking a better estimate. Read-only.',
      annotations: {
        title: 'Setell shop profile',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const data = await ctx.api.get('/api/mcp/v1/shop-profile', ShopProfileResponseSchema);
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_shop_profile');
        throw err;
      }
    },
  );
}
