#!/usr/bin/env node
/**
 * @setell/mcp — entry point.
 *
 * Spawns an MCP server over stdio that exposes a curated subset of Setell's
 * Boxx capabilities as MCP tools, resources, and prompts.
 *
 * Architecture (per BET-3-SETELL-MCP-V0.md §6.2 Option A):
 *   - Setell-MCP is a thin HTTP client of the Setell backend.
 *   - The MCP server holds NO tenant data, opens NO DB connection, runs NO
 *     plan-gate logic. Every read goes through /api/mcp/v1/* on the backend
 *     which re-resolves the extension key on every request.
 *   - Auth lives in env. We boot, probe /health, fail fast on any 401/402.
 *
 * Lifecycle:
 *   1. Load config (extension key + API URL).
 *   2. Construct API client + boot-time health probe — fail closed on auth /
 *      plan errors so the MCP client sees the error before any tool registers.
 *   3. Build McpServer, register tools + resources + prompts.
 *   4. Connect StdioServerTransport — start the request loop.
 *   5. Handle SIGINT/SIGTERM gracefully so the parent client doesn't see a
 *      half-closed transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig } from './config.js';
import { ApiError, SetellApiClient } from './api-client.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { HealthResponseSchema } from './tools/_shared.js';

// NOTE: `version` MUST stay in sync with package.json "version" — the MCP
// client surfaces this string in its server-status panel while npm surfaces
// package.json's. Two readers of the same logical value; keep them equal.
// (Cross-boundary-value discipline per CLAUDE.md.) Bump both together on release.
const SERVER_INFO = {
  name: 'setell',
  version: '0.7.3',
  title: 'Setell',
} as const;

/**
 * Stderr is the only safe channel for human-readable log output — stdout is
 * reserved for the JSON-RPC frame stream. Anything we accidentally write to
 * stdout corrupts the MCP transport.
 */
function logToStderr(msg: string): void {
  process.stderr.write(`[setell-mcp] ${msg}\n`);
}

async function main(): Promise<void> {
  // ---- 1. Config ---------------------------------------------------------
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      logToStderr(err.message);
      process.exit(2);
    }
    throw err;
  }

  // ---- 2. API client + boot probe ---------------------------------------
  const api = new SetellApiClient({
    apiUrl: config.apiUrl,
    extensionKey: config.extensionKey,
    userAgent: config.userAgent,
  });

  if (config.introspection) {
    // Introspection-only boot: skip the auth probe and register the surface so
    // MCP catalog checks (e.g. Glama) can enumerate tools/resources/prompts. A
    // real tool CALL still fails closed — the empty key yields a per-request 401.
    logToStderr(
      'introspection mode — listing surface without auth; ' +
        'tool calls require SETELL_EXTENSION_KEY',
    );
  } else {
    try {
      const health = await api.get('/api/mcp/v1/health', HealthResponseSchema);
      logToStderr(
        `connected — plan=${health.plan} ` +
          `gmail=${health.integrations.gmail} qb=${health.integrations.quickbooks}`,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'unauthorized') {
          logToStderr(
            'Setell rejected the extension key. ' +
              'Mint a fresh key in Settings → Connected Apps → Setell-MCP.',
          );
          process.exit(2);
        }
        if (err.code === 'plan_required') {
          logToStderr(
            'Setell-MCP requires the Pro plan. ' +
              'Upgrade at https://go.setell.ai/settings/billing.',
          );
          process.exit(2);
        }
        logToStderr(`boot health probe failed (${err.code}): ${err.message}`);
        // Network / 5xx — exit non-zero so the MCP client surfaces the error.
        // Restart-on-failure is the client's job.
        process.exit(1);
      }
      throw err;
    }
  }

  // ---- 3. Build the MCP server ------------------------------------------
  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      // Empty objects opt-in to the capability; clients will then call
      // tools/list, resources/list, prompts/list to enumerate the surface.
      tools: {},
      resources: {},
      prompts: {},
    },
    // Hint shown to clients that surface server instructions in their UI.
    instructions:
      'Setell exposes your quote-to-cash workflow as MCP tools, resources, ' +
      'and prompts. Use `setell_get_health` to verify the connection, ' +
      '`setell_find_jobs` to search by status / customer / recency, or pick ' +
      'a slash command like `/setell-triage-inbox` or `/setell-stale-jobs` ' +
      'for a guided workflow. `@`-mention `setell://jobs/{id}` to attach a ' +
      'job to your conversation context.',
  });

  registerAllTools(server, { api });
  registerAllResources(server, { api });
  registerAllPrompts(server);

  // ---- 4. Stdio transport -----------------------------------------------
  const transport = new StdioServerTransport();

  // ---- 5. Graceful shutdown ---------------------------------------------
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logToStderr(`received ${signal}, shutting down`);
    try {
      await server.close();
    } catch (err) {
      logToStderr(`close error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await server.connect(transport);
  logToStderr('listening on stdio');
}

main().catch((err) => {
  logToStderr(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
