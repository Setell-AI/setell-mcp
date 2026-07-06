/**
 * Thin HTTP client wrapping fetch() to the Setell backend.
 *
 * Per BET-3-SETELL-MCP-V0.md §6.2 Option (a): the MCP server is a transport
 * adapter, not a re-implementation of Setell. It opens no DB connections, holds
 * no tenant data, runs no plan-gate logic. Every read flows through
 * `/api/mcp/v1/*` on the backend, which re-resolves the extension key via
 * `resolveExtensionKeyOwner` on every request.
 *
 * Defense in depth: even though the backend Zod-validates its own responses
 * (architecture rule #1 — Zod is the real DB gate), this client re-validates
 * every response with a caller-supplied schema before handing it back to the
 * MCP tool/resource handler. A compromised or stale backend that returns
 * malformed data fails closed here, not at the MCP boundary.
 */

import { z } from 'zod';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2; // initial + 2 retries = 3 attempts max
const RETRY_BASE_DELAY_MS = 250;

// ---------------------------------------------------------------------------
// Error taxonomy — the MCP tool handlers branch on these.
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'unauthorized' //   401 — key missing / revoked
  | 'plan_required' //  402 — Pro-tier feature; surface upgrade URL
  | 'forbidden' //      403 — entitled but not allowed (rare)
  | 'not_found' //      404 — id doesn't exist or isn't in this tenant
  | 'rate_limited' //   429 — backend limiter fired
  | 'bad_request' //    400 — caller error; usually a bad tool arg
  | 'server_error' //   500-599 — backend bug or partial outage
  | 'network' //        fetch threw, timeout, DNS — not a server response
  | 'shape_mismatch'; // 2xx but body didn't match the expected Zod schema

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly code: ApiErrorCode;
  readonly status: number | null;
  /** Backend may return an upgrade target for plan_required. */
  readonly upgradeTo?: 'BUSINESS' | 'PRO';

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number | null,
    upgradeTo?: 'BUSINESS' | 'PRO',
  ) {
    super(message);
    this.code = code;
    this.status = status;
    if (upgradeTo) this.upgradeTo = upgradeTo;
  }
}

// ---------------------------------------------------------------------------
// Shared backend-error envelope. Backend routes return a `{ ok: false, ... }`
// shape so tools can extract a stable error code regardless of HTTP status.
// ---------------------------------------------------------------------------

const BackendErrorSchema = z.object({
  ok: z.literal(false),
  // Routes use either `error` (the original convention, Sprint 1/2 routes)
  // or `message` (the newer Sprint 3+ convention). Accept both; the client
  // surfaces whichever is set.
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
  upgradeTo: z.enum(['BUSINESS', 'PRO']).optional(),
});

// ---------------------------------------------------------------------------
// SetellApiClient
// ---------------------------------------------------------------------------

export interface SetellApiClientOptions {
  apiUrl: string;
  extensionKey: string;
  userAgent: string;
  /** Override fetch for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Override timeout for tests. */
  timeoutMs?: number;
}

export class SetellApiClient {
  private readonly apiUrl: string;
  private readonly extensionKey: string;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: SetellApiClientOptions) {
    this.apiUrl = opts.apiUrl;
    this.extensionKey = opts.extensionKey;
    this.userAgent = opts.userAgent;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * GET a backend route and validate the response body against `schema`.
   *
   * Why caller-supplied schema: per CLAUDE.md "Zod parse is the REAL DB gate"
   * the same rule applies at the MCP-boundary. Each tool/resource has a
   * narrowly-typed view of what it expects; the client doesn't assume a
   * universal envelope.
   */
  async get<T>(
    path: string,
    schema: z.ZodType<T>,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    return this.requestWithRetry<T>('GET', url, schema, undefined, false);
  }

  /**
   * POST a JSON body to a backend route and validate the response.
   *
   * Used by mutating tools. The body is serialized to JSON; the response
   * is parsed against `schema`.
   *
   * Retry semantics:
   *   - Default: transient backend (5xx) + network failures retry up to
   *     `MAX_RETRIES` times with exponential backoff. Safe for idempotent
   *     POSTs whose server-side handler is upsert / reservation-style
   *     (compose_quote token mint, set_autonomy, schedule_send,
   *     cancel_scheduled_send).
   *   - `noRetry: true`: NEVER retry. Required by AGENTS.md for
   *     non-idempotent destructive mutations — chiefly `setell_send_quote`,
   *     which atomically consumes a QuoteSendConfirmation token and
   *     dispatches outbound email. Per AGENTS.md "NEVER retry: email
   *     sends, Slack messages, Stripe charges, any non-idempotent
   *     mutation." A 5xx after the email dispatched but before the HTTP
   *     response arrives would cause a retry → server returns 409
   *     CONFIRMATION_INVALID → agent surfaces "send failed; compose a
   *     fresh token" → operator triggers a duplicate email by following
   *     that advice. Caught by Greptile P1 on PR #225.
   */
  async post<T>(
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    options: { noRetry?: boolean } = {},
  ): Promise<T> {
    const url = this.buildUrl(path);
    return this.requestWithRetry<T>('POST', url, schema, body, options.noRetry === true);
  }

  /**
   * Build a fully-qualified URL with query params. Undefined values are
   * dropped so callers can pass an options object without filtering.
   */
  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const base = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.apiUrl}${base}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async requestWithRetry<T>(
    method: 'GET' | 'POST',
    url: string,
    schema: z.ZodType<T>,
    body: unknown,
    noRetry: boolean,
  ): Promise<T> {
    // Per-call retry budget. `noRetry` collapses to a single attempt —
    // required for non-idempotent POSTs (setell_send_quote) so a 5xx
    // after the side effect dispatched does NOT trigger a duplicate
    // send on the operator's behalf.
    const maxAttempts = noRetry ? 0 : MAX_RETRIES;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        return await this.requestOnce<T>(method, url, schema, body);
      } catch (err) {
        lastError = err;
        // Retry only on transient backend failures + network glitches.
        // 4xx is the caller's fault (or auth) — don't waste round-trips.
        if (err instanceof ApiError && (err.code === 'server_error' || err.code === 'network')) {
          if (attempt < maxAttempts) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
        }
        throw err;
      }
    }
    // Unreachable, but keeps the type checker happy.
    throw lastError;
  }

  private async requestOnce<T>(
    method: 'GET' | 'POST',
    url: string,
    schema: z.ZodType<T>,
    body: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.extensionKey}`,
          Accept: 'application/json',
          'User-Agent': this.userAgent,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'network error';
      throw new ApiError('network', `Cannot reach Setell (${reason}).`, null);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Try to parse a structured error envelope; fall back to the status text.
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        parsed = undefined;
      }

      const backend = BackendErrorSchema.safeParse(parsed);
      const message = backend.success
        ? (backend.data.error ?? backend.data.message ?? response.statusText)
        : response.statusText;
      const upgradeTo = backend.success ? backend.data.upgradeTo : undefined;

      const code = mapStatusToCode(response.status);
      throw new ApiError(code, message || `Setell returned ${response.status}.`, response.status, upgradeTo);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiError('shape_mismatch', 'Setell returned an invalid JSON body.', response.status);
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // Surface the first issue path so we can spot backend-shape drift in
      // Sentry / logs without leaking caller data.
      const firstIssue = parsed.error.issues[0];
      const at = firstIssue?.path.join('.') ?? '(root)';
      const reason = firstIssue?.message ?? 'shape mismatch';
      throw new ApiError(
        'shape_mismatch',
        `Setell returned an unexpected response shape at "${at}": ${reason}`,
        response.status,
      );
    }
    return parsed.data;
  }
}

function mapStatusToCode(status: number): ApiErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 402) return 'plan_required';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'bad_request';
}
