/**
 * Environment configuration for @setell/mcp.
 *
 * Loaded once at process start. Fatal errors here exit the process before any
 * MCP wiring runs — the MCP client sees the error in its server-status panel
 * rather than a hung connection.
 *
 * Env vars:
 *   - SETELL_EXTENSION_KEY  (required) — per-user bearer key minted in Setell
 *                                        Settings → Connected Apps → Setell-MCP.
 *                                        Same key powers the Chrome extension.
 *   - SETELL_API_URL        (optional) — defaults to https://go.setell.ai.
 *                                        Override for staging or local dev.
 *
 * Per BET-3-SETELL-MCP-V0.md §4.3, the env-var channel is the recommended
 * delivery path (vs. a CLI --key flag which leaks via `ps aux`).
 */

// go.setell.ai is the live V2 product; app.setell.ai is the FROZEN V1
// CASA-audit deployment and does not serve the MCP API (V1/V2 topology).
const DEFAULT_API_URL = 'https://go.setell.ai';
const KEY_ENV_VAR = 'SETELL_EXTENSION_KEY';
const API_URL_ENV_VAR = 'SETELL_API_URL';
const INTROSPECTION_ENV_VAR = 'SETELL_MCP_INTROSPECTION';

export interface McpConfig {
  /** Raw extension key. Never log this string — fingerprint it if needed. */
  readonly extensionKey: string;
  /** Base URL of the Setell backend, no trailing slash. */
  readonly apiUrl: string;
  /** Client identifier surfaced in telemetry / User-Agent. */
  readonly userAgent: string;
  /**
   * Introspection-only mode (`SETELL_MCP_INTROSPECTION` set). Enumerate the
   * tool/resource/prompt surface WITHOUT a key or a backend probe — for MCP
   * catalog checks (e.g. Glama) that must start the server and list its
   * capabilities but hold no credentials. Real tool CALLS still fail closed.
   */
  readonly introspection: boolean;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Read + validate env. Throws ConfigError with an actionable message if the
 * extension key is missing or obviously malformed.
 *
 * Looking like an extension key is a cheap pre-flight check — the real
 * validation happens server-side via resolveExtensionKeyOwner during the
 * boot health probe.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiUrl = trimTrailingSlash(env[API_URL_ENV_VAR]?.trim() || DEFAULT_API_URL);

  // Hard-coded UA; keep in sync with package.json "version" and SERVER_INFO
  // (index.ts) — bump all three together on release.
  const userAgent = 'setell-mcp/0.7.3';

  const rawKey = env[KEY_ENV_VAR]?.trim() ?? '';

  // Introspection-only mode: enumerate the surface without validating the key or
  // hitting the backend, so MCP catalog checks (e.g. Glama) can list the
  // tools/resources/prompts. Catalog checkers commonly inject a PLACEHOLDER key
  // (non-empty but malformed), so this MUST short-circuit BEFORE any key
  // validation — an empty OR malformed key is tolerated here. A real tool CALL
  // still fails closed (the invalid bearer yields a per-request 401), so nothing
  // leaks.
  const introspection = /^(1|true|yes|on)$/i.test(env[INTROSPECTION_ENV_VAR]?.trim() ?? '');
  if (introspection) {
    return { extensionKey: rawKey, apiUrl, userAgent, introspection: true };
  }

  if (!rawKey) {
    throw new ConfigError(
      `Setell-MCP requires the ${KEY_ENV_VAR} environment variable. ` +
        'Mint a key at https://go.setell.ai/settings (Connected Apps → Setell-MCP) ' +
        'and add it to your MCP client config.',
    );
  }

  if (!rawKey.startsWith('setell_ext_')) {
    throw new ConfigError(
      `${KEY_ENV_VAR} does not look like a Setell extension key ` +
        '(must start with "setell_ext_"). Did you paste the wrong value?',
    );
  }

  return { extensionKey: rawKey, apiUrl, userAgent, introspection: false };
}
