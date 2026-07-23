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
import { KEY_ENV_VAR, loadConfig } from './config.js';
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
  version: '0.8.0',
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
  // ---- 1. Config (never throws) -----------------------------------------
  const config = loadConfig();

  // ---- 2. API client ----------------------------------------------------
  const api = new SetellApiClient({
    apiUrl: config.apiUrl,
    extensionKey: config.extensionKey,
    userAgent: config.userAgent,
  });

  // ---- 2b. Advisory boot check — NEVER exits ----------------------------
  // The server ALWAYS registers its surface and connects (below), so MCP
  // introspection works even with a placeholder/absent key. This is what lets
  // catalog checks (e.g. Glama) — which run the server with their own env and
  // no real credentials — enumerate tools/resources/prompts. Tool CALLS still
  // fail closed: without a valid key the backend returns 401 and the tool
  // surfaces it. Any boot-time exit here would fail those checks, so we never do.
  if (!config.keyLooksValid) {
    logToStderr(
      config.extensionKey
        ? `${KEY_ENV_VAR} is set but malformed (must start with "setell_ext_") — ` +
            'listing tools anyway; calls fail until a valid key is set.'
        : `${KEY_ENV_VAR} not set — listing tools anyway; calls fail until a key is set. ` +
            'Mint one at https://go.setell.ai/settings (Connected Apps → Setell-MCP).',
    );
  } else {
    try {
      const health = await api.get('/api/mcp/v1/health', HealthResponseSchema);
      logToStderr(
        `connected — plan=${health.plan} ` +
          `gmail=${health.integrations.gmail} qb=${health.integrations.quickbooks}`,
      );
    } catch (err) {
      const detail = err instanceof ApiError ? `${err.code}: ${err.message}` : String(err);
      logToStderr(
        `health probe failed (${detail}) — listing tools anyway; calls will surface the error.`,
      );
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
  logToStderr(`fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exit(1);
});
