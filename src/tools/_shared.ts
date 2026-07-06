/**
 * Shared shapes used by every tool handler — error normalization +
 * the `health` response schema that's referenced by both the tool and
 * the resource handler.
 *
 * Per BET-3-SETELL-MCP-V0.md §8, a plan-required result is rendered as an
 * MCP `isError: true` text block so the calling agent can surface the
 * upgrade URL conversationally instead of crashing the tool loop.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from '../api-client.js';

// ---------------------------------------------------------------------------
// Health schema — shared between setell_get_health (tool) and setell://health
// (resource) per BET-3-SETELL-MCP-V0.md §6.3.
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  /** Opaque to the caller — useful for confirming the right tenant connected. */
  userId: z.string(),
  /**
   * Effective plan — what gates use today. A canceled Pro user has
   * effectivePlan=FREE (canUseSetellMCP returns false in that case, so the
   * route itself would 402; this field is included for completeness).
   */
  plan: z.enum(['FREE', 'BUSINESS', 'PRO']),
  integrations: z.object({
    gmail: z.boolean(),
    quickbooks: z.boolean(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---------------------------------------------------------------------------
// Job list schema — shared by the tool + the corresponding resource template
// (sprint 2 will pick this up for setell://jobs).
// ---------------------------------------------------------------------------

export const FindJobsResponseSchema = z.object({
  ok: z.literal(true),
  jobs: z.array(
    z.object({
      id: z.string(),
      subject: z.string(),
      displayName: z.string().nullable(),
      status: z.string(),
      currentQuoteTotal: z.number().nullable(),
      currentQuoteVersion: z.number().int().nullable(),
      customer: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
      updatedAt: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type FindJobsResponse = z.infer<typeof FindJobsResponseSchema>;

// ---------------------------------------------------------------------------
// Quote schema — shared by setell_get_quote (tool) and the setell://jobs/{id}
// resource template (which embeds the quote-version list).
//
// Timestamps are ISO 8601 strings, never Date objects — JSON-RPC has no Date
// primitive. The backend serializes via toISOString().
//
// `acceptedAt` / `viewedAt` are DERIVED on the backend (not Quote columns):
//   - acceptedAt: latest JobActivity row of type QUOTE_APPROVED for this quote
//   - viewedAt:   latest JobActivity row of type QUOTE_VIEWED for this quote
// ---------------------------------------------------------------------------

export const QuoteLineItemSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  description: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitPrice: z.number(),
  lineTotal: z.number(),
});

export const QuotePayloadSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  version: z.number().int().positive(),
  status: z.string(),
  notes: z.string().nullable(),
  total: z.number(),
  lineItems: z.array(QuoteLineItemSchema),
  customer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  sentAt: z.string().nullable(),
  viewedAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type QuotePayload = z.infer<typeof QuotePayloadSchema>;

export const QuoteResponseSchema = z.object({
  ok: z.literal(true),
  quote: QuotePayloadSchema,
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

// ---------------------------------------------------------------------------
// Customer-list schema — setell_find_customer.
//
// `lifetimeValue` is the sum of totals across ACCEPTED quotes for this
// customer; null if no accepted quote ever existed (distinct from 0, which
// would mean an accepted quote totaling $0).
// ---------------------------------------------------------------------------

export const CustomerListResponseSchema = z.object({
  ok: z.literal(true),
  customers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      jobCount: z.number().int().nonnegative(),
      lifetimeValue: z.number().nullable(),
      lastJobAt: z.string().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type CustomerListResponse = z.infer<typeof CustomerListResponseSchema>;

// ---------------------------------------------------------------------------
// Morning-brief schema — setell_get_morning_brief.
//
// Per BET-3 §6.3 + the calling-agent-voice principle: this is a *snapshot of
// state* the calling agent synthesizes against, not a pre-baked summary.
// ---------------------------------------------------------------------------

export const MorningBriefResponseSchema = z.object({
  ok: z.literal(true),
  generatedAt: z.string(),
  newInboundJobs24h: z.number().int().nonnegative(),
  quotesAwaitingReview: z.number().int().nonnegative(),
  quotesSentNoResponse3d: z.number().int().nonnegative(),
  hotProspects: z.array(
    z.object({
      jobId: z.string(),
      customerName: z.string(),
      quoteTotal: z.number().nullable(),
      lastViewedAt: z.string(),
    }),
  ),
  revenueThisWeek: z.number().nonnegative(),
});
export type MorningBriefResponse = z.infer<typeof MorningBriefResponseSchema>;

// ---------------------------------------------------------------------------
// Job-detail schema — backs the setell://jobs/{id} resource template.
//
// Returns the canonical job plus every quote version (line items elided to
// keep payload bounded — caller pivots to setell_get_quote for line items),
// recent emails (last 20), and the customer-memory snapshot. All
// userId-scoped server-side.
// ---------------------------------------------------------------------------

export const JobDetailResponseSchema = z.object({
  ok: z.literal(true),
  job: z.object({
    id: z.string(),
    subject: z.string(),
    displayName: z.string().nullable(),
    status: z.string(),
    documentType: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    customer: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      phone: z.string().nullable(),
      company: z.string().nullable(),
    }),
    quotes: z.array(
      z.object({
        id: z.string(),
        version: z.number().int().positive(),
        status: z.string(),
        total: z.number(),
        notes: z.string().nullable(),
        sentAt: z.string().nullable(),
        createdAt: z.string(),
        isCurrent: z.boolean(),
      }),
    ),
    recentEmails: z.array(
      z.object({
        id: z.string(),
        direction: z.string(),
        fromAddress: z.string(),
        subject: z.string(),
        receivedAt: z.string(),
      }),
    ),
    customerMemories: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        content: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
});
export type JobDetailResponse = z.infer<typeof JobDetailResponseSchema>;

// ---------------------------------------------------------------------------
// Pricing-signal schema — setell_get_pricing_signal.
//
// Wraps the dispatchPricingAnalyst output (PR #219 commits 1 + 3). The
// `layer` field tells the calling agent which comparable hierarchy
// fired:
//   - analyzed_customer_learned — per-customer learned baseline (strongest)
//   - analyzed_operator_wide    — operator-wide baseline for this jobType
//   - analyzed_similar_jobs     — pgvector retrieval against past quotes
//   - analyzed_industry_benchmark — BLS-tier cold-start anchor (weakest)
//   - no_quote / no_comparables / dispatch_failed — exits where the
//     analyst didn't produce a verdict
// ---------------------------------------------------------------------------

export const PricingSignalLayerSchema = z.enum([
  'analyzed_customer_learned',
  'analyzed_operator_wide',
  'analyzed_similar_jobs',
  'analyzed_industry_benchmark',
  'no_quote',
  'no_comparables',
  'dispatch_failed',
]);
export type PricingSignalLayer = z.infer<typeof PricingSignalLayerSchema>;

// ---------------------------------------------------------------------------
// Price-response schema — the "price-to-win" evidence block shared by
// setell_get_pricing_signal and setell_get_pricing_calibration. Mirrors
// PriceResponseResult (src/services/insights/price-response.ts): the
// operator's own win rate by price position (isotonic-fitted, shrunk) joined
// with margin into an expected-profit curve + recommendation. status=FORMING
// means too few decided outcomes — recommendation is null by contract.
// Optional/nullable on both responses for cross-version compatibility.
// ---------------------------------------------------------------------------

export const PriceResponseSchema = z.object({
  status: z.enum(['READY', 'FORMING']),
  decided: z.number().int().nonnegative(),
  curve: z.array(
    z.object({
      bucket: z.string(),
      position: z.number(),
      decided: z.number().int().nonnegative(),
      won: z.number().int().nonnegative(),
      rawWinRate: z.number().nullable(),
      fittedWinRate: z.number().nullable(),
      marginPct: z.number().nullable(),
      expectedProfit: z.number().nullable(),
    }),
  ),
  recommendation: z
    .object({
      bucket: z.string(),
      position: z.number(),
      fittedWinRate: z.number(),
      marginPct: z.number(),
      expectedProfit: z.number(),
      liftVsParity: z.number().nullable(),
    })
    .nullable(),
  caveats: z.array(z.string()),
});
export type PriceResponse = z.infer<typeof PriceResponseSchema>;

export const PricingSignalResponseSchema = z.object({
  ok: z.literal(true),
  verdict: z.enum(['PASS', 'WARN', 'FLAG']),
  reasoning: z.string(),
  recommendedAmount: z.number().nullable(),
  comparables: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
      customerName: z.string().optional(),
      daysAgo: z.number(),
    }),
  ),
  layer: PricingSignalLayerSchema,
  // Backwards-compat alias for older clients.
  trace: PricingSignalLayerSchema.optional(),
  // Price-to-win evidence (server ≥ this package's version); see
  // PriceResponseSchema. Null/absent on older servers or compute failure.
  priceResponse: PriceResponseSchema.nullish(),
});
export type PricingSignalResponse = z.infer<typeof PricingSignalResponseSchema>;

// ---------------------------------------------------------------------------
// Parts-proposal schema — setell_propose_parts_list (Pricing Intelligence §3).
// Wraps deriveBomForJob: parts priced from the operator's own history with
// per-part provenance + evidence support. PROPOSAL ONLY — the calling agent
// presents it for the operator to confirm before any quote exists.
// ---------------------------------------------------------------------------

// Discriminated on `ok`: the backend returns 200 + { ok:false, code } for
// honest DATA conditions (no_history, derivation_failed) — those must parse
// and present as-is, not explode as a shape_mismatch. Non-2xx still rides
// the ApiError path before this schema is consulted.
export const PartsProposalResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    parts: z.array(
      z.object({
        description: z.string(),
        quantity: z.number(),
        unit: z.string(),
        suggestedUnitPrice: z.number(),
        kind: z.enum(['LABOR', 'MATERIAL', 'OTHER']).nullable(),
        priceSource: z.string(),
        priceSourceMeta: z.unknown(),
        support: z.object({ jobCount: z.number(), share: z.number() }),
      }),
    ),
    attribution: z.string(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    similarJobsUsed: z.number(),
    notes: z.string().nullable(),
  }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);
export type PartsProposalResponse = z.infer<typeof PartsProposalResponseSchema>;

// ---------------------------------------------------------------------------
// Autonomy schemas — setell_get_autonomy / setell_set_autonomy.
//
// Mirrors the in-app /api/settings/autonomy contract. Modes: WATCH (default),
// TRUST (auto-proceed on WARN with note), AUTO (auto-proceed on WARN
// silently). FLAG always asks regardless of mode.
// ---------------------------------------------------------------------------

export const AutonomyModeSchema = z.enum(['WATCH', 'TRUST', 'AUTO']);
export type AutonomyMode = z.infer<typeof AutonomyModeSchema>;

export const AutonomyActionClassSchema = z.enum(['send_quote']);
export type AutonomyActionClass = z.infer<typeof AutonomyActionClassSchema>;

export const AutonomyResponseSchema = z.object({
  ok: z.literal(true),
  policies: z.array(
    z.object({
      actionClass: AutonomyActionClassSchema,
      mode: AutonomyModeSchema,
    }),
  ),
  canConfigure: z.boolean(),
});
export type AutonomyResponse = z.infer<typeof AutonomyResponseSchema>;

// ---------------------------------------------------------------------------
// Shop-profile schemas — setell_get_shop_profile / setell_update_shop_profile.
// Mirrors src/types/shop-profile.ts (the canonical bounds live there); this
// is the stdio client's response contract for /api/mcp/v1/shop-profile.
// ---------------------------------------------------------------------------

export const ShopFinishingModeSchema = z.enum(['IN_HOUSE', 'OUTSOURCED']);

export const ShopProfileResponseSchema = z.object({
  ok: z.literal(true),
  profile: z.object({
    machines: z.array(
      z.object({ name: z.string(), count: z.number(), notes: z.string().optional() }),
    ),
    finishing: z.array(
      z.object({
        process: z.string(),
        mode: ShopFinishingModeSchema,
        notes: z.string().optional(),
      }),
    ),
    materials: z.array(z.string()),
    notes: z.string().nullable(),
    updatedAt: z.string().nullable(),
  }),
});
export type ShopProfileResponse = z.infer<typeof ShopProfileResponseSchema>;

// ---------------------------------------------------------------------------
// Customer-baseline schema — setell_get_customer_baseline + the
// setell://customers/{id}/baseline resource.
//
// Returns the per-jobType learned baseline rows for an operator x customer
// pair. Each row reflects the median/min/max of SIGNED quotes in that
// jobType scope. `jobType: null` = the customer-wide baseline (all
// signed work for this customer, ungrouped).
// ---------------------------------------------------------------------------

export const CustomerBaselineResponseSchema = z.object({
  ok: z.literal(true),
  customer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  baselines: z.array(
    z.object({
      jobType: z.string().nullable(),
      median: z.number(),
      min: z.number(),
      max: z.number(),
      sampleSize: z.number().int().nonnegative(),
      lastSignedAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});
export type CustomerBaselineResponse = z.infer<typeof CustomerBaselineResponseSchema>;

// ---------------------------------------------------------------------------
// Compose-quote schema — setell_compose_quote (Sprint 4 mutator).
//
// Mirrors the in-app compose_email + preview_quote output, collapsed into
// one response. Returns the QuoteSendConfirmation token the calling
// agent passes verbatim to setell_send_quote.
// ---------------------------------------------------------------------------

export const ComposeQuoteResponseSchema = z.object({
  ok: z.literal(true),
  quote: z.object({
    id: z.string(),
    version: z.number().int().positive(),
    total: z.number(),
    lineItems: z.array(
      z.object({
        description: z.string(),
        quantity: z.number(),
        unit: z.string(),
        unitPrice: z.number(),
        lineTotal: z.number(),
      }),
    ),
  }),
  email: z.object({
    to: z.string(),
    subject: z.string(),
    bodySnippet: z.string(),
  }),
  portalUrl: z.string(),
  customer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  confirmationToken: z.string(),
  confirmationExpiresAt: z.string(),
  recipientOverride: z.boolean(),
});
export type ComposeQuoteResponse = z.infer<typeof ComposeQuoteResponseSchema>;

// ---------------------------------------------------------------------------
// Send-quote schema — setell_send_quote (Sprint 4 mutator).
//
// Two response shapes (discriminated by ok):
//   - Success: { ok: true, sent: true, sentTo, sentAt, quoteVersion, ... }
//   - Pricing pushback: ApiError with code 'pricing_pushback' surfaces
//     through errorResultFromApi as a `CallToolResult { isError: true }`
//     — the calling agent renders the pushback in its own voice.
//   - Other failure: ApiError as usual.
//
// The partialFailure field appears only when the email was delivered but
// the post-send status update failed; callers should surface this
// honestly to the operator (the send IS on record).
// ---------------------------------------------------------------------------

export const SendQuoteResponseSchema = z.object({
  ok: z.literal(true),
  sent: z.literal(true),
  sentTo: z.string(),
  sentAt: z.string(),
  quoteVersion: z.number().int().positive(),
  outboundEmailId: z.string().optional(),
  partialFailure: z.string().optional(),
  message: z.string().optional(),
});
export type SendQuoteResponse = z.infer<typeof SendQuoteResponseSchema>;

// ---------------------------------------------------------------------------
// Schedule-send schemas — setell_schedule_send + setell_cancel_scheduled_send.
//
// Two response shapes from the same backend route, discriminated by which
// of `scheduled` or `cancelled` is set. `friendlyTime` is a human-readable
// rendering of the target time the calling agent can echo back to the
// operator without re-formatting.
// ---------------------------------------------------------------------------

export const ScheduleSendResponseSchema = z.object({
  ok: z.literal(true),
  scheduled: z.literal(true),
  quoteVersion: z.number().int().positive(),
  scheduledSendAt: z.string(),
  friendlyTime: z.string(),
  message: z.string(),
});
export type ScheduleSendResponse = z.infer<typeof ScheduleSendResponseSchema>;

export const CancelScheduledSendResponseSchema = z.object({
  ok: z.literal(true),
  cancelled: z.literal(true),
  quoteVersion: z.number().int().positive(),
  previouslyScheduledFor: z.string().nullable(),
});
export type CancelScheduledSendResponse = z.infer<typeof CancelScheduledSendResponseSchema>;

// ---------------------------------------------------------------------------
// Learning-coverage schema — setell_get_learning_coverage.
//
// Surfaces the operator's vertical-moat metrics: how many customers
// have learned baselines, how many jobType-narrowed rows, the
// operator-wide sampleSize, and a one-word maturityTier the calling
// agent can use as a voice anchor ("Cooper has 12 signed quotes
// contributing — your moat for them is `deep`").
// ---------------------------------------------------------------------------

export const MaturityTierSchema = z.enum(['cold-start', 'warming', 'mature', 'deep']);
export type MaturityTier = z.infer<typeof MaturityTierSchema>;

export const LearningCoverageResponseSchema = z.object({
  ok: z.literal(true),
  totalSignedQuotes: z.number().int().nonnegative(),
  customersWithBaseline: z.number().int().nonnegative(),
  jobTypeBaselines: z.number().int().nonnegative(),
  operatorWideBaseline: z
    .object({
      sampleSize: z.number().int().nonnegative(),
      lastSignedAt: z.string(),
    })
    .nullable(),
  maxSampleSize: z.number().int().nonnegative(),
  medianSampleSize: z.number().int().nonnegative(),
  maturityTier: MaturityTierSchema,
});
export type LearningCoverageResponse = z.infer<typeof LearningCoverageResponseSchema>;

// ---------------------------------------------------------------------------
// Pricing-calibration schema — setell_get_pricing_calibration.
//
// Mirrors PricingCalibrationReport (src/services/insights/pricing-calibration.ts)
// via GET /api/mcp/v1/pricing-calibration: the operator's pricing report card —
// every draft-time prediction joined to its real outcome, with right-censoring
// (OPEN/STALE), per-source band calibration (observed vs claimed coverage),
// the censoring-aware win curve by price position, and honest caveats.
// ---------------------------------------------------------------------------

export const PricingCalibrationResponseSchema = z.object({
  ok: z.literal(true),
  asOf: z.string(),
  horizonDays: z.number().int().positive(),
  dataset: z.object({
    jobsScanned: z.number().int().nonnegative(),
    labelled: z.number().int().nonnegative(),
    byLabel: z.record(z.string(), z.number().int().nonnegative()),
    bySource: z.record(z.string(), z.number().int().nonnegative()),
    predictionCoverage: z.number().nullable(),
    truncated: z.boolean(),
  }),
  pointAccuracy: z.object({
    n: z.number().int().nonnegative(),
    mape: z.number().nullable(),
    medianApe: z.number().nullable(),
    meanSignedErrorPct: z.number().nullable(),
  }),
  bandCalibration: z.array(
    z.object({
      source: z.string(),
      n: z.number().int().nonnegative(),
      observedCoverage: z.number().nullable(),
      nominalCoverage: z.number().nullable(),
    }),
  ),
  winCurve: z.array(
    z.object({
      bucket: z.string(),
      won: z.number().int().nonnegative(),
      lost: z.number().int().nonnegative(),
      noDecision: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
      open: z.number().int().nonnegative(),
      winRateUpper: z.number().nullable(),
      winRateLower: z.number().nullable(),
      winRateShrunk: z.number().nullable(),
      marginN: z.number().int().nonnegative(),
      avgMarginPct: z.number().nullable(),
      profitIndex: z.number().nullable(),
    }),
  ),
  verdictOutcomes: z.array(
    z.object({
      verdict: z.string(),
      won: z.number().int().nonnegative(),
      lost: z.number().int().nonnegative(),
      lostPrice: z.number().int().nonnegative(),
      noDecision: z.number().int().nonnegative(),
      inFlight: z.number().int().nonnegative(),
    }),
  ),
  priceResponse: PriceResponseSchema.nullish(),
  // Response-time → win-rate curve. Optional for cross-version compat.
  speedToQuote: z
    .object({
      status: z.enum(['READY', 'FORMING']),
      decided: z.number().int().nonnegative(),
      medianResponseHours: z.number().nullable(),
      curve: z.array(
        z.object({
          bucket: z.string(),
          decided: z.number().int().nonnegative(),
          won: z.number().int().nonnegative(),
          rawWinRate: z.number().nullable(),
          shrunkWinRate: z.number().nullable(),
        }),
      ),
      fastVsSlowDelta: z.number().nullable(),
      caveats: z.array(z.string()),
    })
    .nullish(),
  // Raw vs material-drift-adjusted point error on WON jobs ("model degraded
  // vs market moved"). Null when not computable.
  driftSeparation: z
    .object({
      n: z.number().int().nonnegative(),
      unadjustable: z.number().int().nonnegative(),
      rawMedianApe: z.number().nullable(),
      adjustedMedianApe: z.number().nullable(),
      explainedPp: z.number().nullable(),
      avgMaterialShare: z.number().nullable(),
      commoditiesSeen: z.array(z.string()),
    })
    .nullish(),
  caveats: z.array(z.string()),
});
export type PricingCalibrationResponse = z.infer<typeof PricingCalibrationResponseSchema>;

// ---------------------------------------------------------------------------
// Save-customer-memory schema — setell_save_customer_memory mutator.
//
// Mirrors the in-app save_customer_memory Boxx tool. Backed by
// POST /api/mcp/v1/customers/{id}/memory. Persists a single learned pattern
// about a customer mid-conversation — the operator-confirmed sibling to the
// AI-batch extractCustomerMemories pass.
// ---------------------------------------------------------------------------

export const CustomerMemoryTypeSchema = z.enum(['PRICING', 'PREFERENCE', 'COMMUNICATION']);
export type CustomerMemoryTypeValue = z.infer<typeof CustomerMemoryTypeSchema>;

export const SaveCustomerMemoryResponseSchema = z.object({
  ok: z.literal(true),
  memory: z.object({
    id: z.string(),
    type: CustomerMemoryTypeSchema,
    content: z.string(),
  }),
});
export type SaveCustomerMemoryResponse = z.infer<typeof SaveCustomerMemoryResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/mcp/v1/customers/{id}/memory — the read side of the memory write
// path. Lists every CustomerMemory row for the (operator, customer) pair so
// the external agent can audit / reason about / decide-to-overwrite a
// learned pattern. Also backs the `setell://customers/{id}/memory` resource.
// ---------------------------------------------------------------------------

export const CustomerMemoryRecordSchema = z.object({
  id: z.string(),
  type: CustomerMemoryTypeSchema,
  content: z.string(),
  /** Anchor job (when set on inline save). Null for legacy / batch-extracted rows. */
  sourceJobId: z.string().nullable(),
  /** Origin tag (`inline_save` etc.). Null when metadata is missing/malformed. */
  source: z.string().nullable(),
  /** Confidence (0–1) for batch-extracted rows. Null for inline saves. */
  confidence: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerMemoryRecordValue = z.infer<typeof CustomerMemoryRecordSchema>;

export const ListCustomerMemoryResponseSchema = z.object({
  ok: z.literal(true),
  customer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  memories: z.array(CustomerMemoryRecordSchema),
});
export type ListCustomerMemoryResponse = z.infer<typeof ListCustomerMemoryResponseSchema>;

// ---------------------------------------------------------------------------
// Quote-tier schemas — setell_generate_quote_tiers / setell_select_quote_tier
// / setell_get_quote_tiers ("three ways to win the work"). Tiers are stored
// as ONE group server-side; selecting materializes a tier into the job's
// single evolving quote via the revision engine. Customer prices only — the
// backend shape carries no operator cost/margin by construction.
// ---------------------------------------------------------------------------

export const QuoteTierLevelSchema = z.enum(['GOOD', 'BETTER', 'BEST']);

const TierLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitPrice: z.number(),
  kind: z.enum(['LABOR', 'MATERIAL', 'OTHER']).optional(),
});

export const QuoteTierRecordSchema = z.object({
  level: QuoteTierLevelSchema,
  label: z.string(),
  summary: z.string(),
  total: z.number(),
  recommended: z.boolean(),
  lineItems: z.array(TierLineItemSchema),
});
export type QuoteTierRecord = z.infer<typeof QuoteTierRecordSchema>;

// Discriminated on `ok`: 200 + { ok:false } carries honest data conditions
// (no_quote — the job has no quote to tier yet; generation_failed — the
// model pass produced no usable result, retry once).
export const GenerateQuoteTiersResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    tierGroupId: z.string(),
    tiers: z.array(QuoteTierRecordSchema),
  }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);
export type GenerateQuoteTiersResponse = z.infer<typeof GenerateQuoteTiersResponseSchema>;

export const SelectQuoteTierResponseSchema = z.object({
  ok: z.literal(true),
  level: QuoteTierLevelSchema,
  quoteId: z.string(),
  version: z.number(),
  materialized: z.boolean(),
});
export type SelectQuoteTierResponse = z.infer<typeof SelectQuoteTierResponseSchema>;

export const ListQuoteTiersResponseSchema = z.object({
  ok: z.literal(true),
  tierGroups: z.array(
    z.object({
      tierGroupId: z.string(),
      status: z.string(),
      selectedLevel: QuoteTierLevelSchema.nullable(),
      baseQuoteId: z.string(),
      baseIsCurrent: z.boolean(),
      createdAt: z.string(),
      tiers: z.array(QuoteTierRecordSchema),
    }),
  ),
});
export type ListQuoteTiersResponse = z.infer<typeof ListQuoteTiersResponseSchema>;

// ---------------------------------------------------------------------------
// Realized-margin schemas — setell_get_job_margin / setell_get_margin_summary
// (the retrospective half of unit economics). OPERATOR-FACING ONLY — the
// calling agent must never surface cost/margin to a customer.
// ---------------------------------------------------------------------------

export const MarginCostSourceSchema = z.enum([
  'CATALOG_PROVENANCE',
  'PRICE_BOOK_MATCH',
  'LABOR_RATE',
  'UNKNOWN',
]);

export const MarginLineRecordSchema = z.object({
  position: z.number(),
  description: z.string(),
  kind: z.enum(['LABOR', 'MATERIAL', 'OTHER']).nullable(),
  quantity: z.number(),
  unit: z.string(),
  lineRevenue: z.number(),
  unitCost: z.number().nullable(),
  lineCost: z.number().nullable(),
  costSource: MarginCostSourceSchema,
  matchedDescription: z.string().optional(),
  matchScore: z.number().optional(),
});

// Discriminated on `ok`: 200 + { ok:false, code:'no_quote' } is an honest
// data condition (the job has nothing to cost yet), not an error.
export const JobMarginResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    margin: z.object({
      jobId: z.string(),
      quoteId: z.string(),
      quoteVersion: z.number(),
      revenue: z.number(),
      revenueBasis: z.enum(['PAYMENTS', 'QUOTE_TOTAL']),
      knownCost: z.number(),
      costedShare: z.number(),
      marginPct: z.number().nullable(),
      breakdown: z.object({
        lines: z.array(MarginLineRecordSchema),
        laborRateUsed: z.number().nullable(),
        matchingCapped: z.boolean(),
      }),
      laborRateSet: z.boolean(),
      targetMarginPct: z.number().nullable(),
      computedAt: z.string(),
    }),
  }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);
export type JobMarginResponse = z.infer<typeof JobMarginResponseSchema>;

export const MarginSummaryResponseSchema = z.object({
  ok: z.literal(true),
  summary: z.object({
    jobsConsidered: z.number(),
    jobsWithMargin: z.number(),
    overallMarginPct: z.number().nullable(),
    totalRevenue: z.number(),
    totalKnownCost: z.number(),
    targetMarginPct: z.number().nullable(),
    belowTargetCount: z.number(),
    laborRateSet: z.boolean(),
    byJobType: z.array(
      z.object({ jobType: z.string(), jobs: z.number(), avgMarginPct: z.number() }),
    ),
    worstJobs: z.array(
      z.object({
        jobId: z.string(),
        label: z.string(),
        jobType: z.string().nullable(),
        revenue: z.number(),
        knownCost: z.number(),
        costedShare: z.number(),
        marginPct: z.number().nullable(),
        revenueBasis: z.string(),
      }),
    ),
    uncostedJobs: z.number(),
    staleSkipped: z.number(),
  }),
});
export type MarginSummaryResponse = z.infer<typeof MarginSummaryResponseSchema>;

// ---------------------------------------------------------------------------
// Error → CallToolResult normalization
// ---------------------------------------------------------------------------

/**
 * Convert an ApiError into the MCP "error result" shape so the calling agent
 * can render it without aborting the tool loop. Per the MCP spec, an error
 * result is `{ isError: true, content: [...] }` — distinct from a thrown
 * exception (which would be reported as a protocol error).
 */
export function errorResultFromApi(err: ApiError, toolName: string): CallToolResult {
  let userText: string;
  switch (err.code) {
    case 'plan_required': {
      const target = err.upgradeTo ?? 'PRO';
      userText =
        `${toolName} requires the Setell ${target} plan. ` +
        `Upgrade at https://go.setell.ai/settings/billing.`;
      break;
    }
    case 'unauthorized':
      userText =
        'Setell could not authenticate the extension key. ' +
        'Mint a new key in Settings → Connected Apps → Setell-MCP and update your MCP client config.';
      break;
    case 'rate_limited':
      userText = `Setell rate-limited this request: ${err.message}. Try again shortly.`;
      break;
    case 'not_found':
      userText = `Not found: ${err.message}`;
      break;
    case 'network':
      userText = `Cannot reach Setell. ${err.message}`;
      break;
    case 'shape_mismatch':
      userText =
        `Setell returned an unexpected response shape. This is a Setell bug — ` +
        `please report it. (${err.message})`;
      break;
    default:
      userText = err.message;
  }
  return {
    isError: true,
    content: [{ type: 'text', text: userText }],
  };
}

/**
 * Wrap a typed value as an MCP success result. Tools emit both `content`
 * (human-readable / model-readable text) AND `structuredContent` (machine-
 * readable JSON) — clients that support structuredContent get the typed
 * payload; older clients see the JSON-stringified text block.
 */
export function successResultFromJson(payload: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as { [key: string]: unknown },
  };
}
