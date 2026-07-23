/**
 * setell_apply_playbook — apply a curated trade playbook for the operator.
 *
 * Non-destructive by construction: the backend only writes onto untouched
 * surfaces — structure-only starter templates when the operator has none
 * (every line unitPrice 0), a words-only payment-terms suggestion only over
 * the schema default — and stamps the playbook pointer that activates trade
 * intake guidance. It never overwrites operator data and never touches
 * autonomy or the shop profile. Returns the honest apply report
 * ({applied, skipped, nextSteps}) — narrate skips faithfully.
 *
 * Maps to POST /api/mcp/v1/playbooks/apply.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  ApplyPlaybookResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

// Standalone package — cannot import the app's PLAYBOOK_SLUGS. Mirror of
// src/lib/mcp-remote/manifest.ts and src/lib/playbooks/constants.ts; the server
// (/api/mcp/v1/playbooks/apply) is the real gate. Keep in sync on every add.
const PLAYBOOK_SLUGS = [
  'machine_shop',
  'hvac',
  'landscaping',
  'contractor',
  'electrician',
  'plumber',
] as const;

export function registerApplyPlaybookTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_apply_playbook',
    {
      title: 'Apply a Setell trade playbook',
      description:
        'Apply a Setell-curated trade playbook (from setell_list_playbooks). ' +
        'Safe by construction: seeds structure-only starter templates (no ' +
        'prices) only if the operator has none, and never overwrites their ' +
        'data — surfaces already customized are skipped with a reason. ' +
        'Returns {applied, skipped, nextSteps}; relay skips honestly. ' +
        'Confirm with the operator before applying or switching.',
      inputSchema: {
        slug: z.enum(PLAYBOOK_SLUGS).describe('The playbook to apply.'),
      },
      annotations: {
        title: 'Apply a Setell trade playbook',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ slug }) => {
      try {
        const data = await ctx.api.post(
          '/api/mcp/v1/playbooks/apply',
          ApplyPlaybookResponseSchema,
          {
            slug,
          },
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_apply_playbook');
        throw err;
      }
    },
  );
}
