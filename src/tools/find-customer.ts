/**
 * setell_find_customer — search customers by email or name.
 *
 * Maps to `GET /api/mcp/v1/customers` on the Setell backend. Tenant-scoped
 * server-side via the extension key → userId resolution.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.1, this is the searchy/filtery half of
 * customer lookup — once an agent has the customer id, the
 * setell://customers/{id} resource (sprint 3) handles direct fetches.
 *
 * Input bounds:
 *   - email: exact-match equality (case-insensitive at the backend).
 *   - name:  `contains` (case-insensitive) for partial-match search.
 *   - limit: 1-25, default 10.
 *
 * At least one of email / name MUST be supplied — an unbounded "list all
 * customers" call is intentionally not exposed (defense against ungated
 * tenant-data scrapes; expensive to compute lifetimeValue for every row).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  CustomerListResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const inputShape = {
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .optional()
    .describe('Exact-match customer email (case-insensitive).'),
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe(
      'Partial-match on customer name (case-insensitive). ' +
        'Use a few characters of the company or contact name.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe('Max customers to return (1-25). Defaults to 10 on the backend.'),
};

export function registerFindCustomerTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_find_customer',
    {
      title: 'Find Setell customers',
      description:
        'Search Setell customers by email (exact) or name (partial). ' +
        'Returns each match with jobCount, lifetimeValue (sum of accepted ' +
        'quote totals), and lastJobAt. At least one of email or name is ' +
        'required. Read-only.',
      annotations: {
        title: 'Find Setell customers',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: inputShape,
    },
    async (args) => {
      try {
        const data = await ctx.api.get('/api/mcp/v1/customers', CustomerListResponseSchema, {
          email: args.email,
          name: args.name,
          limit: args.limit,
        });
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_find_customer');
        throw err;
      }
    },
  );
}
