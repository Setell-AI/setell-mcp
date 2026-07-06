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

export interface McpConfig {
  /** Raw extension key. Never log this string — fingerprint it if needed. */
  readonly extensionKey: string;
  /** Base URL of the Setell backend, no trailing slash. */
  readonly apiUrl: string;
  /** Client identifier surfaced in telemetry / User-Agent. */
  readonly userAgent: string;
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
  const rawKey = env[KEY_ENV_VAR]?.trim() ?? '';
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

  const apiUrl = trimTrailingSlash(env[API_URL_ENV_VAR]?.trim() || DEFAULT_API_URL);

  // Match a `package.json` version dynamically would require JSON import; for
  // v0 a hard-coded UA is sufficient. Bump when the package version moves.
  const userAgent = 'setell-mcp/0.7.0';

  return { extensionKey: rawKey, apiUrl, userAgent };
}
