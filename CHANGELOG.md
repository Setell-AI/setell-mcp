# Changelog

All notable changes to `@setell/mcp`. Versions before 0.7.0 were internal milestones in the Setell monorepo — **0.7.0 is the first version published to npm.** PR numbers reference the (private) monorepo.

## 0.7.4 — 2026-07-07

- **Never exit at boot** — the definitive robustness fix. The server now ALWAYS registers its tools/resources/prompts and connects the transport, regardless of the key (present, absent, or malformed) or any env flag. Earlier versions gated introspection on `SETELL_MCP_INTROSPECTION`, but MCP catalog checkers (Glama) run the server with their own environment and a placeholder key — they don't set that flag — so the malformed-key check still exited the container before it could respond. A missing/invalid key now logs a warning and the surface is listed anyway; tool calls still fail closed at the backend (401). Removes the `SETELL_MCP_INTROSPECTION` env var and its Dockerfile `ENV`.

## 0.7.3 — 2026-07-07

- **Introspection-mode fix**: `SETELL_MCP_INTROSPECTION=1` now short-circuits *all* key validation, not just a missing key. Catalog checkers (Glama) inject a placeholder `SETELL_EXTENSION_KEY` (non-empty but malformed) when they detect a server needs one — 0.7.2 rejected it in the `setell_ext_` format check *before* introspection mode applied, so the container exited with code 1 before responding. Now an empty **or** malformed key is tolerated under the introspection flag; real tool calls still fail closed.

## 0.7.2 — 2026-07-06

- **Introspection mode** (`SETELL_MCP_INTROSPECTION=1`): the server now boots and enumerates its tools/resources/prompts without a key or a backend health probe — so MCP catalog checks (e.g. Glama) can validate the surface. Real tool calls still require a valid `SETELL_EXTENSION_KEY` (an empty bearer yields a per-request 401); no credential is shared. Default behaviour (no flag) is unchanged — a missing/invalid key still fails fast at boot.
- Add a `Dockerfile` (build + run) so the server can be built and introspected in a container.

## 0.7.1 — 2026-07-06

- Point `repository` and `bugs` at the public source repo [`setell-ai/setell-mcp`](https://github.com/setell-ai/setell-mcp). 0.7.0 pointed at the private monorepo, so the npm page's repo/bugs links 404'd. Metadata + source-link fix only — no runtime code changes.

## 0.7.0 — 2026-07-06 (first npm release)

The full surface at publish: **25 tools** (16 read-only, 9 mutating — 2 destructive), **6 resources**, **8 prompts**.

Added since 0.6.0:

- `setell_get_job_margin` / `setell_get_margin_summary` — realized margin: what the operator ACTUALLY made on a job, and margin across recent WON jobs vs target. `marginPct` withheld below the honesty floor. (#411)
- `setell_get_pricing_calibration` — the pricing report card: every draft-time price prediction joined to its real outcome (point accuracy, band calibration, win curve, verdict×outcome, caveats). (#546)
- `setell_get_pricing_signal` now returns `priceResponse` — win-rate-by-price-position curve + expected-profit recommendation. (#547)
- `setell_get_shop_profile` / `setell_update_shop_profile` — the shop's capability sheet (machines, finishing processes, materials, how-we-run note) as judgment context on every draft. (#583)

## 0.6.0 — 2026-06-10 (internal)

- Good/better/best quote tiers from any agent: `setell_generate_quote_tiers`, `setell_select_quote_tier`, `setell_get_quote_tiers`. (#410)

## 0.5.0 — 2026-05-23 (internal)

- 3 new prompts (`/setell-pricing-check`, `/setell-moat-coverage`, `/setell-send-quote`) + 3 resource templates (`setell://autonomy`, `setell://learning/coverage`, `setell://customers/{id}/baseline`). (#232)

Landed later under 0.5.0 without a version bump:

- `setell_save_customer_memory` — customer-memory write path. (#240)
- `setell_get_customer_memory` + `setell://customers/{id}/memory` — customer-memory read path. (#242)
- `setell_propose_parts_list` — parts-list proposal mined from the operator's own job history, with per-part price provenance. (#404)
- Hosted remote MCP endpoint at `https://go.setell.ai/api/mcp` (tools-only; same key, same backend). (#393)

## 0.4.0 — 2026-05-22 (internal)

- `setell_get_learning_coverage` — vertical-moat depth metrics + `maturityTier`. (#228)

## 0.3.0 — 2026-05-22 (internal)

- First mutators: `setell_compose_quote` (AI draft + single-use confirmation token) and `setell_send_quote` (pricing-analyst pre-check + atomic confirmation guard). (#225)
- Scheduled send: `setell_schedule_send` / `setell_cancel_scheduled_send`. (#225)
- (0.2.0 was skipped — no release carried that number.)

## 0.1.0 — 2026-05-22 (internal)

- `setell_get_pricing_signal`, `setell_get_autonomy`, `setell_set_autonomy`, `setell_get_customer_baseline`. (#219)
- npm publish prep (bin entry, `prepublishOnly` build).

## 0.0.1 — 2026-05-16 (internal)

- Initial stdio server: `setell_get_health`, `setell_find_jobs`, `setell_get_quote`, `setell_find_customer`, `setell_get_morning_brief`; resources `setell://health` + `setell://jobs/{id}`; 5 prompts (`/setell-triage-inbox`, `/setell-stale-jobs`, `/setell-weekly-revenue`, `/setell-customer-history`, `/setell-draft-followup`). (#160)
