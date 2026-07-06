# @setell/mcp

Drive your Setell quote-to-cash workflow from any MCP-aware agent — Claude Code, Claude.ai, ChatGPT, or any client that speaks the [Model Context Protocol](https://modelcontextprotocol.io).

[Setell](https://go.setell.ai) is a vertical agent for small-business quote-to-cash (machine shops, contractors, HVAC, service businesses). It ingests inbound email, drafts AI quotes, applies structured revisions, sends invoices, and syncs to QuickBooks. Setell exposes the same agent across three peer surfaces: a web app, the Gmail inbox, and any MCP-aware agent. `@setell/mcp` is the third surface — it lets you ask "what's stale?", "show me the Cooper job", or "draft a follow-up" from whatever agent you live in, without leaving it. Built for operators who run their business from Claude Code, and for bookkeepers and fractional CFOs who drive Setell on behalf of an operator.

> **Status:** v0 — stdio transport, read-mostly surface. Pro-tier feature. See [`docs/BET-3-SETELL-MCP-V0.md`](https://github.com/andrewmjacob/snowboxx/blob/main/docs/BET-3-SETELL-MCP-V0.md) in the main repo for the full design.

## Requires

- A [Setell account](https://go.setell.ai). The Free tier covers read-only exploration; the **Pro** tier is required to use the agent channel end-to-end (the boot health probe fails closed with an upgrade link if your plan doesn't qualify).
- Node.js 18 or newer.
- An MCP-aware client. Tested with Claude Code, Claude desktop, and the Claude.ai Custom Connector flow.

## Install

The server is published to npm as `@setell/mcp`. Most clients run it via `npx` so you don't have to install anything globally.

If you do want a global install:

```bash
npm install -g @setell/mcp
```

## Configure

You need a **Setell extension key**. Mint one in your Setell account at **Settings → Extension Key** ([go.setell.ai/settings](https://go.setell.ai/settings)). The page shows the raw key exactly once — copy it into your MCP client config below. The key is per-user, revocable from the same page, and resolves directly to your Setell tenant. The same key powers the Chrome extension.

### Claude Code

```bash
claude mcp add setell --command "npx -y @setell/mcp" --env SETELL_EXTENSION_KEY=setell_ext_...
```

Or edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows) directly:

```json
{
  "mcpServers": {
    "setell": {
      "command": "npx",
      "args": ["-y", "@setell/mcp"],
      "env": {
        "SETELL_EXTENSION_KEY": "setell_ext_..."
      }
    }
  }
}
```

Restart Claude Code (or the desktop app). The Setell tools, resources, and prompts will appear in the server-status panel.

### Remote endpoint (no local install)

Setell also hosts the same 25-tool surface as a remote MCP server — no Node, no npx, nothing local:

```json
{
  "mcpServers": {
    "setell": {
      "url": "https://go.setell.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer setell_ext_..."
      }
    }
  }
}
```

Any client that supports remote MCP servers with custom headers (Claude Code, Claude Desktop, API integrations) can use it today. Auth, plan gating, and tenant scoping are identical to the stdio path — same key, same backend.

### Claude.ai (Custom Connector)

Claude.ai's web Custom Connector flow requires OAuth on the remote server — that's the next phase for the hosted endpoint above. Until then, claude.ai users can run the stdio server via the desktop app config.

### ChatGPT desktop and other MCP clients

Any client that supports stdio MCP servers can use the `npx -y @setell/mcp` invocation above. Set `SETELL_EXTENSION_KEY` in the client's per-server environment.

### Environment variables

| Variable               | Required | Default                 | Notes                                                                                  |
| ---------------------- | -------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `SETELL_EXTENSION_KEY` | Yes      | —                       | Per-user bearer key minted at [go.setell.ai/settings](https://go.setell.ai/settings). |
| `SETELL_API_URL`       | No       | `https://go.setell.ai` | Override for staging / local dev. No trailing slash.                                   |

## How auth works

The MCP server reads `SETELL_EXTENSION_KEY` at boot, calls `/api/mcp/v1/health` once to verify the key, plan, and integrations, and then attaches the key to every backend request as `Authorization: Bearer <key>`. The Setell backend re-resolves the key on every request — the MCP process never holds tenant data and never opens a database connection.

If the key is missing, malformed, revoked, or your plan doesn't qualify, the MCP server exits with a clear error message before any tool registers. The error surfaces in your MCP client's server-status panel rather than as a hung connection.

See `docs/BET-3-SETELL-MCP-V0.md` §4 for the full auth model.

## What's in it

The v0 surface is intentionally tight — a small, discoverable set that we expand as we watch how external agents actually use it.

### Tools (model-invoked)

Annotated with `readOnlyHint` and `destructiveHint` per the MCP spec. 25 tools: 16 read-only and 9 mutating. Of the mutators, two are marked destructive — `setell_send_quote` (irreversible outbound email) and `setell_save_customer_memory` (persists a memory row). The rest (`setell_set_autonomy`, `setell_update_shop_profile`, `setell_compose_quote`, `setell_schedule_send`, `setell_cancel_scheduled_send`, `setell_generate_quote_tiers`, `setell_select_quote_tier`) are non-destructive configuration/draft actions.

#### Read-only (16)

| Tool                              | Title                              | What it does                                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setell_get_health`               | Setell connection health           | Verify the connection. Returns the connected userId (opaque), the effective plan tier, and whether Gmail / QuickBooks are connected.                                                                                       |
| `setell_find_jobs`                | Find Setell jobs                   | Filter jobs by status, customer email, recency. Returns a paginated list with id, customerName, status, last quote version, total, updatedAt.                                                                              |
| `setell_get_quote`                | Get a Setell quote                 | Fetch a single quote by id. Returns line items, total, status, and key timestamps (sentAt, viewedAt, acceptedAt).                                                                                                          |
| `setell_find_customer`            | Find Setell customers              | Search customers by email (exact) or name (partial). Returns id, jobCount, lifetimeValue, lastJobAt.                                                                                                                       |
| `setell_get_morning_brief`        | Setell morning brief               | Today's snapshot: new inbound jobs in the last 24h, quotes awaiting review, stale sent quotes (>3d), top 3 hot prospects, revenue this week.                                                                               |
| `setell_get_pricing_signal`       | Setell pricing signal              | Get Setell's pricing-analyst verdict on a quote BEFORE you send it. Returns `verdict` (PASS / WARN / FLAG), one-paragraph `reasoning`, optional `recommendedAmount` counter, structured `comparables`, the `layer` of the comparable hierarchy that fired (customer-learned baseline → operator-wide → similar-jobs → industry benchmark), and `priceResponse` (win-rate-by-price-position curve + expected-profit peak). Surface FLAG verdicts as confirmations; WARN is autonomy-mode-dependent. |
| `setell_propose_parts_list`       | Setell parts-list proposal         | Derive a full parts-list proposal for a job from the operator's OWN history: similar past jobs mined for co-occurring parts, adapted to this job, each part priced from the operator's history with a provenance receipt and evidence support (`support.jobCount` / `support.share`). PROPOSAL ONLY — the operator confirms or edits before any quote is created. `no_history` means no similar past jobs with line items yet. |
| `setell_get_autonomy`             | Setell autonomy modes              | Read the operator's per-action-class autonomy modes. For each class (currently: `send_quote`): WATCH (pause on WARN/FLAG), TRUST (auto-proceed on WARN with a note, ask on FLAG), or AUTO (auto-proceed on WARN silently). FLAG always asks regardless of mode. |
| `setell_get_shop_profile`         | Setell shop profile                | Read the operator's shop profile — the capability sheet quotes are judged against: machines (name × count, envelope notes), finishing processes (in-house vs outsourced), materials commonly run, and a free-form how-we-run note. Returns an empty sheet when the operator hasn't filled it in — offer `setell_update_shop_profile` when that's blocking a better estimate. |
| `setell_get_customer_baseline`    | Setell customer pricing baseline   | Read the operator's learned pricing baseline (median / min / max / sampleSize / lastSignedAt) for a specific customer, broken out per job-type. Sampled over SIGNED quotes only — reflects the operator's actual pricing for this relationship. |
| `setell_get_learning_coverage`    | Setell learning-loop coverage      | Aggregate moat metrics: total SIGNED quotes, distinct customers with learned baselines, jobType-narrowed baseline count, operator-wide baseline (sampleSize + lastSignedAt), and a one-word `maturityTier` (`cold-start` / `warming` / `mature` / `deep`) summarizing the operator's data depth. Use for narrating analyst verdicts ("your moat for Cooper is deep — 12 signed kitchens to compare against"). |
| `setell_get_pricing_calibration`  | Setell pricing report card         | How RIGHT has Setell's pricing memory been? Joins every draft-time price prediction to its real outcome: `pointAccuracy` (MAPE, median error, signed bias), `bandCalibration` per memory source (observed vs claimed coverage), `winCurve` (win rate by price position, realized margin per bucket), `verdictOutcomes` (did FLAG calls precede price-losses), `priceResponse`, and `caveats` you MUST repeat when summarizing (survivorship, censoring, small n). |
| `setell_get_customer_memory`      | Setell customer memory list        | List every CustomerMemory row stored for a specific customer — pricing patterns, preferences, communication style — with the full record shape (memory id, type, content, source job, source tag, confidence, timestamps). Audit what's known before writing via `setell_save_customer_memory`. |
| `setell_get_quote_tiers`          | List Setell quote tiers            | List the good/better/best option groups generated for a job (most recent first) — each tier's label, summary, line items, total, and `baseIsCurrent` (false means select will conflict; regenerate instead). |
| `setell_get_job_margin`           | Setell realized job margin         | What the operator ACTUALLY made on a job. Revenue from recorded payments (fallback: the decided quote total); per-line cost from price-book provenance, a high-trust price-book match, or labor hours × loaded labor rate. `marginPct` is withheld (null) when too little line value has a sourced cost — present the UNKNOWN lines honestly instead of inventing a number. OPERATOR-ONLY data: never share cost or margin with a customer. |
| `setell_get_margin_summary`       | Setell margin summary              | Realized margin across the operator's recent WON jobs: revenue-weighted overall margin (honestly-costed jobs only), per-jobType averages (worst first), the 3 worst jobs, the count below target margin, and how many jobs could not be costed. OPERATOR-ONLY data. |

#### Mutating (9)

| Tool                            | Title                              | What it does                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setell_set_autonomy`           | Set Setell autonomy mode           | **Mutator (idempotent).** Change the operator's mode for one action class. WATCH allowed for all plans; TRUST and AUTO require Business or Pro. Confirm with the operator before flipping a mode on their behalf — this changes how Boxx behaves on future sends. |
| `setell_update_shop_profile`    | Update Setell shop profile         | **Mutator (idempotent).** PARTIAL patch of the shop profile — only the fields you pass change, but each provided list REPLACES that whole field, so read `setell_get_shop_profile` first and send the complete updated list. Steers how Setell judges complexity / cycle-time / finish fit on every future draft — confirm with the operator before writing. |
| `setell_compose_quote`          | Compose a Setell quote email       | **Mutator (idempotent-ish).** Drafts the quote email body (AI-generated in the operator's brand voice) AND mints a single-use confirmation token bound to this quote version + recipient. Returns the preview shape (quote, email, portalUrl, customer, confirmationToken, confirmationExpiresAt). Token TTL: 15 minutes. Plan-gated. |
| `setell_send_quote`             | Send a Setell quote                | **Mutator (destructive — IRREVERSIBLE).** Sends the doorbell email via DKIM-delegated Resend (or SETELL_DEFAULT fallback). Requires a valid `confirmationToken` from `setell_compose_quote`. Runs the pricing-analyst pre-check first: on WARN/FLAG with WATCH mode, or any FLAG, returns 409 + `pricing_pushback` for the calling agent to surface; retry with `acknowledgePricingWarning: true` only after operator confirmation. Same atomic guard as the in-app `send_quote` — drift (revision, recipient change, expiry, replay) fails closed. |
| `setell_schedule_send`          | Schedule a Setell quote send       | **Mutator (idempotent).** Stamps `scheduledSendAt` on the latest quote of a job; the 5-min cron picks it up and dispatches via the canonical pipeline. Bounds: 1 minute to 30 days in the future. Does NOT re-run pricing-analyst (operator already approved) — call `setell_get_pricing_signal` first if pricing certainty matters. |
| `setell_cancel_scheduled_send`  | Cancel a scheduled Setell send     | **Mutator (idempotent).** Clears a pending scheduled send on the latest quote of a job. Returns the previous schedule time (or null if none was pending). |
| `setell_save_customer_memory`   | Setell save customer memory        | **Mutator (destructive — persists a row).** Persist a single operator-confirmed pattern about a customer mid-conversation. Three types: PRICING (rates, discount patterns), PREFERENCE (quote structure / special requirements), COMMUNICATION (tone, timing, expected info). Read back into Boxx and the agent surface the next time this customer is in scope. |
| `setell_generate_quote_tiers`   | Generate Setell quote tiers        | **Mutator.** Generate good/better/best options around a job's current quote (proven close-rate lifter): GOOD is a leaner lower-priced option, BETTER mirrors the existing baseline verbatim (recommended), BEST is an expanded premium option. Stores the options as a group — does NOT change the active quote; call `setell_select_quote_tier` once the operator or customer picks one. Plan-gated. |
| `setell_select_quote_tier`      | Select a Setell quote tier         | **Mutator.** Make a chosen tier the job's active quote. GOOD/BEST create a new quote version from that tier's line items via the deterministic revision engine; BETTER is a no-op (it already IS the baseline). A 409 with code `stale` means the quote changed since the options were generated — regenerate first. After selecting, compose/send operate on the chosen tier. |

### Resources (user-attached via `@`-mention)

| URI                                  | Returns                                                                                                                                                                                                                  | MIME               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `setell://health`                    | Current connection + plan + integration snapshot. Read this first to verify the MCP server is healthy.                                                                                                                   | `application/json` |
| `setell://jobs/{id}`                 | Full job state: customer, every quote version (summaries), recent emails, customer-memory snapshot. Pivot to `setell_get_quote` for line items on a specific version.                                                    | `application/json` |
| `setell://autonomy`                  | Current per-action-class autonomy modes (WATCH / TRUST / AUTO). Read this when reasoning about how Boxx will behave on the next send.                                                                                    | `application/json` |
| `setell://learning/coverage`         | Vertical-moat metrics + maturity tier (cold-start / warming / mature / deep). Use when sizing up how much weight to give pricing-analyst verdicts.                                                                       | `application/json` |
| `setell://customers/{id}/baseline`   | Per-customer learned pricing baseline rows (one per jobType plus customer-wide). Sampled over SIGNED quotes — reflects the operator's actual pricing for this relationship.                                              | `application/json` |
| `setell://customers/{id}/memory`     | Every CustomerMemory row stored for a specific customer — pricing patterns, preferences, communication style, each with source tag, confidence, and timestamps. Read before writing via `setell_save_customer_memory`.  | `application/json` |

### Prompts (slash commands)

| Slash command              | Arguments                       | What it expands into                                                                                                                                                         |
| -------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/setell-triage-inbox`     | none                            | New inbound jobs from the last 24h: customer ask, proposed price band, NEW-vs-needs-clarification recommendation, prioritized by inferred importance.                        |
| `/setell-stale-jobs`       | `older_than_days?: number = 7`  | Sent quotes whose last touch is older than `{older_than_days}` days. For each, attaches customer history and proposes a follow-up matching the customer's historical cadence. |
| `/setell-weekly-revenue`   | none                            | Trailing 7-day revenue summary: signed, paid, in-pipeline, week-over-week deltas, the largest open opportunity, anomalies flagged.                                            |
| `/setell-customer-history` | `customer: string`              | Resolves a customer by name, attaches their full history, then answers your next question with that context loaded.                                                          |
| `/setell-draft-followup`   | `job_id: string`                | Drafts a follow-up email in your brand voice for the given job. Does **not** send — sending requires a separate, deliberate action.                                            |
| `/setell-pricing-check`    | `job_id: string`                | Runs `setell_get_pricing_signal` and narrates the verdict in the operator's voice (PASS / WARN / FLAG + reasoning + recommended counter). Does **not** send — operator picks the next action. |
| `/setell-moat-coverage`    | none                            | One-paragraph narrative of the operator's Setell vertical-moat depth (maturity tier, customer breadth, sample-size, next milestone). Pulls from `setell_get_learning_coverage`. |
| `/setell-send-quote`       | `job_id: string`                | Orchestrates the full compose → pricing-check → confirm → send flow. Stops for operator confirmation before the irreversible send. Uses the same safety stack as the in-app `send_quote` Boxx tool. |

## Example queries

Once installed and running, ask your agent any of:

- *"Show me my stale jobs from the last two weeks and rank them by how likely they are to close."*
- *"Draft a follow-up for the Cooper roof-replacement job in my voice — don't send it yet."*
- *"Pull up `@setell://jobs/clx8h3p9a000` and tell me what changed between version 1 and version 2."*
- *"Use `/setell-triage-inbox` to walk me through this morning's new requests, and flag anything that looks like a repeat customer."*
- *"What's my revenue this week vs. last week? Use `/setell-weekly-revenue`."*
- *"Before I send this quote for $1,800 on job `clx8h3p9a000`, call `setell_get_pricing_signal` and tell me what my pricing-analyst says."*
- *"What does Setell know about how I price kitchen jobs for Cooper? Use `setell_get_customer_baseline`."*
- *"Flip my `send_quote` autonomy to Trust so Boxx auto-proceeds on routine WARN pushback. Use `setell_set_autonomy`."*
- *"Compose a quote for job `clx8h3p9a000` with `setell_compose_quote`, show me the preview, then send it with `setell_send_quote` after I confirm."*
- *"Schedule the Cooper quote to go out tomorrow at 9am Pacific — use `setell_schedule_send`."*
- *"Actually cancel the schedule on that one, let me look at it again — `setell_cancel_scheduled_send`."*
- *"How much pricing brain does Setell have built up for me? Use `setell_get_learning_coverage` and summarize."*

## What's NOT in v0

- No OAuth on the remote endpoint yet (bearer keys only) — claude.ai/ChatGPT web connectors land with the OAuth phase.
- The remote endpoint is tools-only; resources and prompts are stdio-only for now.

## Troubleshooting

**"Setell-MCP requires the SETELL_EXTENSION_KEY environment variable."** — The key isn't reaching the spawned process. In Claude Code, check that your `claude_desktop_config.json` has the key under the `env` block (not just exported in your shell — the spawned `npx` process doesn't inherit your shell env).

**"Setell rejected the extension key."** — The key is revoked, malformed, or belongs to a different environment. Mint a fresh one at [go.setell.ai/settings](https://go.setell.ai/settings).

**"Setell-MCP requires the Pro plan."** — Upgrade at [go.setell.ai/settings/billing](https://go.setell.ai/settings/billing).

**Tools list is empty.** — The boot health probe failed before tools registered. Check your MCP client's server-status panel for the stderr message; the server logs every fatal error there.

## Links

- Setell: [go.setell.ai](https://go.setell.ai)
- Source: [github.com/andrewmjacob/snowboxx](https://github.com/andrewmjacob/snowboxx) (in `packages/mcp-server/`)
- Issues: [github.com/andrewmjacob/snowboxx/issues](https://github.com/andrewmjacob/snowboxx/issues)
- Model Context Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io)

## License

MIT — see [LICENSE](./LICENSE).
