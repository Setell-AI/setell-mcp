/**
 * setell_get_pricing_calibration — the operator's pricing report card.
 *
 * How RIGHT has Setell's pricing memory been, measured against reality?
 * Every draft-time prediction (frozen on the v1 quote) joined to what
 * actually happened: point accuracy + bias on won jobs, per-source band
 * calibration (did reality land inside the band as often as the band
 * CLAIMED — a p25–p75 benchmark claims 50%, a min/max learned band claims
 * (n−1)/(n+1)), the win curve by price position with censoring-aware
 * bounds + shrinkage, realized margin per bucket as an expected-profit
 * index, and the analyst verdict × outcome table.
 *
 * Useful examples:
 *   - "Is my pricing right overall?"
 *   - "How accurate has Setell's pricing memory actually been?"
 *   - "Do I lose jobs when I quote above what my history suggests?"
 *
 * The response carries machine-readable `caveats` (survivorship bias,
 * right-censoring, small samples) — repeat them when summarizing; an
 * overconfident summary of thin data is exactly what this tool exists to
 * prevent.
 *
 * Read-only. Maps to GET /api/mcp/v1/pricing-calibration.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  PricingCalibrationResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  horizonDays: z
    .number()
    .int()
    .min(7)
    .max(365)
    .optional()
    .describe(
      'Days after the last send before an unanswered quote counts as stale ' +
        '(right-censoring horizon). Omit for the default (45). The server ' +
        'clamps out-of-range values.',
    ),
};

export function registerGetPricingCalibrationTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_get_pricing_calibration',
    {
      title: 'Setell pricing report card',
      description:
        "How RIGHT has Setell's pricing memory been? Joins every draft-time " +
        'price prediction to its real outcome: `pointAccuracy` (MAPE, median ' +
        'error, signed bias — won jobs only), `bandCalibration` per memory ' +
        'source (observed vs CLAIMED coverage), `winCurve` (win rate by price ' +
        'position quoted ÷ predicted, censoring-aware, shrunk toward the pooled ' +
        'rate on small samples, with realized margin per bucket as ' +
        '`profitIndex`), `verdictOutcomes` (did FLAG calls precede ' +
        'price-losses), `priceResponse` (fitted win-rate curve + expected-profit ' +
        'recommendation, READY only), and `caveats` you MUST repeat when summarizing ' +
        '(survivorship, censoring, small n). Use when the operator asks "is my ' +
        'pricing right?", "how accurate is Setell\'s memory?", or "do I lose ' +
        'work when I price high?". Read-only.',
      annotations: {
        title: 'Setell pricing report card',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { horizonDays } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.get(
          '/api/mcp/v1/pricing-calibration',
          PricingCalibrationResponseSchema,
          horizonDays != null ? { horizonDays } : undefined,
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError)
          return errorResultFromApi(err, 'setell_get_pricing_calibration');
        throw err;
      }
    },
  );
}
