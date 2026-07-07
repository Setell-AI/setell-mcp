/**
 * Environment configuration for @setell/mcp.
 *
 * `loadConfig` NEVER throws. The server always registers its tool/resource/
 * prompt surface and connects (see index.ts), so MCP introspection
 * (initialize, tools/list, resources/list, prompts/list) works regardless of
 * whether a valid key is present. That robustness is deliberate: MCP catalog
 * checks (e.g. Glama) run the server with a PLACEHOLDER or absent key and their
 * own environment, and ANY boot-time exit fails their check. Tool CALLS still
 * fail closed — without a valid key the backend returns 401 and the tool
 * surfaces the error.
 *
 * Env vars:
 *   - SETELL_EXTENSION_KEY  (needed for real use) — per-user bearer key minted
 *                            in Settings → Connected Apps → Setell-MCP. Same key
 *                            powers the Chrome extension.
 *   - SETELL_API_URL        (optional) — defaults to https://go.setell.ai.
 *                            Override for staging or local dev.
 */

// go.setell.ai is the live V2 product; app.setell.ai is the FROZEN V1
// CASA-audit deployment and does not serve the MCP API (V1/V2 topology).
const DEFAULT_API_URL = 'https://go.setell.ai';
export const KEY_ENV_VAR = 'SETELL_EXTENSION_KEY';
const API_URL_ENV_VAR = 'SETELL_API_URL';

export interface McpConfig {
  /** Raw extension key (`''` if unset). Never log this string. */
  readonly extensionKey: string;
  /** Base URL of the Setell backend, no trailing slash. */
  readonly apiUrl: string;
  /** Client identifier surfaced in telemetry / User-Agent. */
  readonly userAgent: string;
  /**
   * True when the key is present and well-formed (starts with `setell_ext_`).
   * A cheap pre-flight — the real validation happens server-side on every
   * request via resolveExtensionKeyOwner. When false, the server still starts
   * and lists its surface; tool calls fail closed at the backend (401).
   */
  readonly keyLooksValid: boolean;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Read env into an McpConfig. NEVER throws — a missing or malformed key simply
 * yields `keyLooksValid: false`, and the caller lists the surface anyway. See
 * the module doc for why boot-time exits are avoided.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiUrl = trimTrailingSlash(env[API_URL_ENV_VAR]?.trim() || DEFAULT_API_URL);

  // Hard-coded UA; keep in sync with package.json "version" and SERVER_INFO
  // (index.ts) — bump all three together on release.
  const userAgent = 'setell-mcp/0.7.4';

  const rawKey = env[KEY_ENV_VAR]?.trim() ?? '';
  const keyLooksValid = rawKey.startsWith('setell_ext_');

  return { extensionKey: rawKey, apiUrl, userAgent, keyLooksValid };
}
