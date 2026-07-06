/**
 * setell_update_shop_profile — partial patch of the operator's shop
 * capability sheet.
 *
 * Mutating tool. Per CLAUDE.md *Product Surface Architecture* parity: the
 * Settings UI (full replace), the in-app Boxx `update_shop_profile` tool
 * (patch), and this MCP tool (patch) all write through the same
 * `src/services/shop-profile.ts` service, so state converges across
 * surfaces.
 *
 * PATCH semantics: only provided fields change; each provided list REPLACES
 * that whole field — read setell_get_shop_profile first and send the
 * complete updated list.
 *
 * Maps to POST /api/mcp/v1/shop-profile.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  ShopFinishingModeSchema,
  ShopProfileResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  machines: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        count: z.number().int().min(1).max(99),
        notes: z.string().max(200).optional(),
      }),
    )
    .max(25)
    .optional()
    .describe(
      "Full replacement machine list, e.g. [{ name: 'Haas VF-2SS', count: 2, notes: '30×16×20 in travels' }]. Max 25.",
    ),
  finishing: z
    .array(
      z.object({
        process: z.string().min(1).max(80),
        mode: ShopFinishingModeSchema,
        notes: z.string().max(200).optional(),
      }),
    )
    .max(15)
    .optional()
    .describe(
      "Full replacement finishing list, e.g. [{ process: 'anodize', mode: 'OUTSOURCED', notes: 'via PlateWorks' }]. Max 15.",
    ),
  materials: z
    .array(z.string().min(1).max(40))
    .max(40)
    .optional()
    .describe('Full replacement list of materials commonly run, e.g. ["6061-T6", "304 SS"].'),
  notes: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe('Free-form how-we-run note, max 2000 chars. Pass null or an empty string to clear.'),
};

export function registerUpdateShopProfileTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_update_shop_profile',
    {
      title: 'Update Setell shop profile',
      description:
        "PARTIAL patch of the operator's shop profile — only the fields you " +
        'pass change; each provided list REPLACES that whole field, so read ' +
        'setell_get_shop_profile first and send the complete updated list ' +
        '(to add a machine: existing machines plus the new one). This steers ' +
        'how Setell judges complexity / cycle-time / finish fit on every ' +
        'future draft — confirm with the operator before writing.',
      annotations: {
        title: 'Update Setell shop profile',
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
        const data = await ctx.api.post(
          '/api/mcp/v1/shop-profile',
          ShopProfileResponseSchema,
          body,
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_update_shop_profile');
        throw err;
      }
    },
  );
}
