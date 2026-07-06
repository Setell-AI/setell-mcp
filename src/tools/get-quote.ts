/**
 * setell_get_quote — fetch a single quote with line items, totals, and timing.
 *
 * Two calling shapes, both supported per BET-3-SETELL-MCP-V0.md §2.1:
 *
 *   - `{ quoteId }`            → look up the quote directly.
 *   - `{ jobId, version? }`    → look up by job + version (latest if omitted).
 *
 * Tenant isolation is enforced server-side — the route re-scopes through
 * `quote.job.userId` so a leaked quoteId from another tenant cannot leak data.
 *
 * Maps to:
 *   GET /api/mcp/v1/quotes/[id]                                 (quoteId form)
 *   GET /api/mcp/v1/quotes/by-job?jobId=...&version=...         (jobId form)
 *
 * For now the jobId form routes through the same backend by resolving via
 * `setell_find_jobs` upstream; sprint 2 ships only the `{ quoteId }` path
 * because the resource template (setell://jobs/{id}) already exposes the
 * version list — once the calling agent picks a version it has the quoteId.
 *
 * Sprint 2 implements the `{ quoteId }` path as the canonical shape. The
 * `{ jobId, version }` discriminated union shape is reserved for sprint 3
 * when we add the prompt-driven flows (BET-3 §3, /setell-customer-history).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import { QuoteResponseSchema, errorResultFromApi, successResultFromJson } from './_shared.js';

const inputShape = {
  quoteId: z.string().trim().min(1).max(64).describe('The quote id (UUID). Required.'),
};

export function registerGetQuoteTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_get_quote',
    {
      title: 'Get a Setell quote',
      description:
        'Fetch a single Setell quote by id. Returns line items, total, ' +
        'version number, status, customer info, and key timestamps ' +
        '(sentAt, viewedAt, acceptedAt). Use this once you know the ' +
        'quote id — get one from setell_find_jobs or the ' +
        'setell://jobs/{id} resource. Read-only.',
      annotations: {
        title: 'Get a Setell quote',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: inputShape,
    },
    async (args) => {
      try {
        const data = await ctx.api.get(
          `/api/mcp/v1/quotes/${encodeURIComponent(args.quoteId)}`,
          QuoteResponseSchema,
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_quote');
        throw err;
      }
    },
  );
}
