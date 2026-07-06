/**
 * Resource registry for @setell/mcp.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.2, resources are the underrated half of MCP —
 * they're how the bookkeeper / agent-first user "@-mentions" a job into a
 * Claude Code session rather than going through a model-mediated tool call.
 *
 * Sprint 1 ships only `setell://health` as a proof of the shape — clients can
 * `resources/list` it and `resources/read` it to verify the auth+plan probe
 * works on the resource transport as well as the tool transport.
 *
 * Sprint 2 adds the heavy hitters:
 *   - setell://jobs/{id}, setell://jobs/{id}/quotes/v{n}
 *   - setell://customers/{id}, setell://customers/{id}/history
 *   - setell://settings/brand
 *   - setell://insights/morning-brief
 * plus parameter completion (see BET-3-SETELL-MCP-V0.md §10).
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SetellApiClient } from '../api-client.js';
import { ApiError } from '../api-client.js';
import {
  HealthResponseSchema,
  JobDetailResponseSchema,
  AutonomyResponseSchema,
  CustomerBaselineResponseSchema,
  LearningCoverageResponseSchema,
  ListCustomerMemoryResponseSchema,
} from '../tools/_shared.js';

export interface ResourceRegistrationContext {
  api: SetellApiClient;
}

const HEALTH_URI = 'setell://health';
const AUTONOMY_URI = 'setell://autonomy';
const LEARNING_COVERAGE_URI = 'setell://learning/coverage';

export function registerAllResources(
  server: McpServer,
  ctx: ResourceRegistrationContext,
): void {
  registerHealthResource(server, ctx);
  registerJobResourceTemplate(server, ctx);
  registerAutonomyResource(server, ctx);
  registerLearningCoverageResource(server, ctx);
  registerCustomerBaselineTemplate(server, ctx);
  registerCustomerMemoryTemplate(server, ctx);
}

/**
 * Helper: render an MCP-JSON resource read-result for either a parsed
 * response payload or a normalized error envelope. Centralizes the
 * try/catch shape used by every resource handler.
 */
function jsonResource(uri: URL, payload: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorPayload(err: unknown) {
  if (err instanceof ApiError) {
    return {
      ok: false as const,
      code: err.code,
      error: err.message,
      upgradeTo: err.upgradeTo,
    };
  }
  return { ok: false as const, code: 'unknown', error: String(err) };
}

/**
 * setell://health — connection + plan + integration snapshot.
 *
 * Same backing route as the `setell_get_health` tool; exposing it as a
 * resource too lets users `@`-attach it to a conversation as context
 * ("here's what Setell knows about my account") instead of having the
 * model invoke a tool.
 */
function registerHealthResource(server: McpServer, ctx: ResourceRegistrationContext): void {
  server.registerResource(
    'health',
    HEALTH_URI,
    {
      title: 'Setell connection health',
      description:
        'Current Setell connection state: effective plan, integration status ' +
        '(Gmail, QuickBooks), and the connected user identifier. Read this if ' +
        'the agent needs to know what Setell can do right now.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const health = await ctx.api.get('/api/mcp/v1/health', HealthResponseSchema);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(health, null, 2),
            },
          ],
        };
      } catch (err) {
        // Resources can't return isError — surface the failure as a JSON body
        // with a typed error so the calling agent can still reason about it.
        const errPayload =
          err instanceof ApiError
            ? { ok: false as const, code: err.code, error: err.message, upgradeTo: err.upgradeTo }
            : { ok: false as const, code: 'unknown', error: String(err) };
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(errPayload, null, 2),
            },
          ],
        };
      }
    },
  );
}

/**
 * setell://jobs/{id} — full job state addressable as an MCP resource.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.2, this is how a bookkeeper / agent-first
 * user `@`-attaches a job into a Claude Code session — two clicks instead
 * of a tool-call round-trip.
 *
 * Returns the same canonical payload the route serves: customer, all quote
 * versions (summaries — line items elided), recent emails, and the
 * customer-memory snapshot. Tenant-scoped on the backend.
 *
 * The MCP spec allows ResourceTemplate to declare a URI template per RFC
 * 6570; the `{id}` placeholder is captured and passed to the read handler.
 *
 * Resource-template completion (BET-3 §10) — typing `setell://jobs/` and
 * having the client autocomplete from `setell_find_jobs` — lands in sprint 3.
 */
function registerJobResourceTemplate(
  server: McpServer,
  ctx: ResourceRegistrationContext,
): void {
  const template = new ResourceTemplate('setell://jobs/{id}', {
    // No list callback — directories of jobs are surfaced via setell_find_jobs.
    // Completion callback comes in sprint 3 per BET-3 §10.
    list: undefined,
  });

  server.registerResource(
    'job',
    template,
    {
      title: 'Setell job',
      description:
        'A Setell job — customer, every quote version (summary), recent ' +
        'emails, and customer-memory snapshot. URI: setell://jobs/{id}. ' +
        'Pivot to setell_get_quote for line items on a specific version.',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      // ResourceTemplate hands us the captured `{id}` as `params.id`.
      // It may be a string or string[]; coerce + guard.
      const rawId = params['id'];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (typeof id !== 'string' || id.length === 0) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                { ok: false, code: 'bad_request', error: 'Missing job id in URI.' },
                null,
                2,
              ),
            },
          ],
        };
      }

      try {
        const data = await ctx.api.get(
          `/api/mcp/v1/jobs/${encodeURIComponent(id)}`,
          JobDetailResponseSchema,
        );
        return jsonResource(uri, data);
      } catch (err) {
        return jsonResource(uri, errorPayload(err));
      }
    },
  );
}

/**
 * setell://autonomy — current per-action-class autonomy modes.
 *
 * Lets the operator @-attach "what's my Boxx behavior right now?"
 * into a Claude Code chat. Mirrors the `setell_get_autonomy` tool;
 * exposing as a resource means the calling agent doesn't have to
 * round-trip a tool call to load the context.
 */
function registerAutonomyResource(
  server: McpServer,
  ctx: ResourceRegistrationContext,
): void {
  server.registerResource(
    'autonomy',
    AUTONOMY_URI,
    {
      title: 'Setell autonomy modes',
      description:
        "Current per-action-class autonomy modes (WATCH / TRUST / AUTO) " +
        'for the operator. WATCH = pause on every pricing pushback; ' +
        'TRUST = auto-proceed on WARN with a note, ask on FLAG; AUTO = ' +
        'auto-proceed on WARN silently. FLAG always asks regardless of ' +
        'mode. Read this when you need to reason about how Boxx will ' +
        'behave on the next send.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const data = await ctx.api.get('/api/mcp/v1/autonomy', AutonomyResponseSchema);
        return jsonResource(uri, data);
      } catch (err) {
        return jsonResource(uri, errorPayload(err));
      }
    },
  );
}

/**
 * setell://learning/coverage — vertical-moat metrics.
 *
 * Same data as the `setell_get_learning_coverage` tool, but addressable
 * as a resource so it can be @-attached as conversation context. Useful
 * when a bookkeeper / intermediary is sizing up whether the operator's
 * pricing-analyst signal is strong enough to act on.
 */
function registerLearningCoverageResource(
  server: McpServer,
  ctx: ResourceRegistrationContext,
): void {
  server.registerResource(
    'learning-coverage',
    LEARNING_COVERAGE_URI,
    {
      title: 'Setell learning-loop coverage',
      description:
        "Vertical-moat metrics: total SIGNED quotes, distinct customers " +
        'with learned baselines, jobType-narrowed baseline count, the ' +
        'operator-wide baseline if present, and a one-word maturityTier ' +
        "(cold-start / warming / mature / deep) summarizing the " +
        "operator's data depth. Use when sizing up how much weight to " +
        "give pricing-analyst verdicts on a new account.",
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const data = await ctx.api.get(
          '/api/mcp/v1/learning-coverage',
          LearningCoverageResponseSchema,
        );
        return jsonResource(uri, data);
      } catch (err) {
        return jsonResource(uri, errorPayload(err));
      }
    },
  );
}

/**
 * setell://customers/{id}/baseline — per-customer learned pricing baseline.
 *
 * The Vertical Moat read path as an addressable resource. Lets an
 * agent @-attach "what does Setell know about how I price for this
 * customer?" alongside the conversation. Backed by
 * /api/mcp/v1/customers/{id}/baseline.
 */
function registerCustomerBaselineTemplate(
  server: McpServer,
  ctx: ResourceRegistrationContext,
): void {
  const template = new ResourceTemplate('setell://customers/{id}/baseline', {
    list: undefined,
  });

  server.registerResource(
    'customer-baseline',
    template,
    {
      title: "Setell customer pricing baseline",
      description:
        "Learned pricing baseline rows for a specific customer (the " +
        'Vertical Moat read path). One row per jobType scope (e.g. ' +
        '`kitchen_remodel`) plus the customer-wide row when present ' +
        '(`jobType: null`). Each row has median / min / max / sampleSize ' +
        '/ lastSignedAt — sampled over SIGNED quotes only. Returns 404 ' +
        "when the customer isn't owned by the caller (multi-tenant " +
        'safety).',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const rawId = params['id'];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (typeof id !== 'string' || id.length === 0) {
        return jsonResource(uri, {
          ok: false,
          code: 'bad_request',
          error: 'Missing customer id in URI.',
        });
      }
      try {
        const data = await ctx.api.get(
          `/api/mcp/v1/customers/${encodeURIComponent(id)}/baseline`,
          CustomerBaselineResponseSchema,
        );
        return jsonResource(uri, data);
      } catch (err) {
        return jsonResource(uri, errorPayload(err));
      }
    },
  );
}

/**
 * setell://customers/{id}/memory — every learned pattern Setell has
 * stored for a specific customer.
 *
 * Read-side complement to the `setell_save_customer_memory` mutator
 * (PR #14) and the `setell_get_customer_memory` tool that lands in
 * the same PR. Lets an agent @-attach "what do I know about this
 * customer?" alongside the conversation context rather than
 * round-tripping a tool call. Backed by
 * /api/mcp/v1/customers/{id}/memory.
 */
function registerCustomerMemoryTemplate(
  server: McpServer,
  ctx: ResourceRegistrationContext,
): void {
  const template = new ResourceTemplate('setell://customers/{id}/memory', {
    list: undefined,
  });

  server.registerResource(
    'customer-memory',
    template,
    {
      title: 'Setell customer memory',
      description:
        'Every CustomerMemory row stored for a specific customer — ' +
        'pricing patterns, preferences, communication style. Each row ' +
        'carries id / type / content / sourceJobId / source tag / ' +
        'confidence / timestamps. Useful for "what do I know about ' +
        'this customer?" before deciding whether to write a fresh ' +
        'memory via setell_save_customer_memory. Returns 404 when the ' +
        "customer isn't owned by the caller (multi-tenant safety).",
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const rawId = params['id'];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (typeof id !== 'string' || id.length === 0) {
        return jsonResource(uri, {
          ok: false,
          code: 'bad_request',
          error: 'Missing customer id in URI.',
        });
      }
      try {
        const data = await ctx.api.get(
          `/api/mcp/v1/customers/${encodeURIComponent(id)}/memory`,
          ListCustomerMemoryResponseSchema,
        );
        return jsonResource(uri, data);
      } catch (err) {
        return jsonResource(uri, errorPayload(err));
      }
    },
  );
}
