/**
 * setell_find_jobs — list jobs filtered by status / customer email / recency.
 *
 * Maps to `GET /api/mcp/v1/jobs` on the Setell backend. All filters are
 * tenant-scoped server-side via the extension-key → userId resolution; the
 * caller cannot leak across tenants by guessing query params.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.1, this is the parameterized read tool —
 * resource-style URIs (`setell://jobs/{id}`) handle direct-by-id fetches in
 * sprint 2; `find_jobs` handles the searchy / filtery case the URI surface
 * can't cleanly express.
 *
 * Input shape mirrors the backend route's accepted query params. Bounds:
 *   - status:        enum of JobStatus values (see prisma/schema.prisma)
 *   - customerEmail: bounded email (255 chars)
 *   - limit:         1-50 (matches backend cap)
 *   - cursor:        opaque pagination cursor returned by the backend
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import { FindJobsResponseSchema, errorResultFromApi, successResultFromJson } from './_shared.js';

// Job statuses — kept in sync with prisma/schema.prisma::JobStatus. Read-only
// tool, so we accept the full set (the mutating Boxx tools restrict to
// {NEW, REVISING} per BoxxAllowedStatusTransitions; that's a write-side rule).
const JobStatusEnum = z.enum([
  'NEW',
  'DRAFTING',
  'AWAITING_APPROVAL',
  'SENT',
  'REVISING',
  'ACCEPTED',
  'REJECTED',
  'SIGNED',
  'INVOICED',
  'PAID',
  'ARCHIVED',
]);

// Raw shape — the SDK converts this into JSON Schema for tool discovery.
// Each field is optional and explicitly bounded; defense against the model
// emitting NaN, oversized strings, or null vs undefined drift.
const inputShape = {
  status: JobStatusEnum.optional().describe(
    'Filter to a single job status. Omit to include all statuses.',
  ),
  customerEmail: z
    .string()
    .trim()
    .email()
    .max(255)
    .optional()
    .describe('Filter to jobs whose customer email exactly matches.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Max jobs to return (1-50). Defaults to 20 on the backend.'),
};

export function registerFindJobsTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_find_jobs',
    {
      title: 'Find Setell jobs',
      description:
        'List Setell jobs filtered by status, customer email, or recency. ' +
        'Use this to find jobs by criteria; use the setell://jobs/{id} resource ' +
        'when you already know a specific job id. Returns up to 50 rows per call ' +
        'with the most-recently-updated jobs first.',
      annotations: {
        title: 'Find Setell jobs',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: inputShape,
    },
    async (args) => {
      try {
        const data = await ctx.api.get('/api/mcp/v1/jobs', FindJobsResponseSchema, {
          status: args.status,
          customerEmail: args.customerEmail,
          limit: args.limit,
        });
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_find_jobs');
        throw err;
      }
    },
  );
}
