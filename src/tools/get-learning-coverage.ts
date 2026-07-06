/**
 * setell_get_learning_coverage — vertical-moat coverage metrics.
 *
 * The "how deep is the moat?" tool. Returns aggregate counts across
 * the operator's `CustomerLearnedBaseline` rows + total SIGNED quote
 * count, plus a one-word `maturityTier` the calling agent can use as
 * a voice anchor:
 *
 *   - cold-start: 0 signed quotes — analyst falls back to industry
 *                 benchmark
 *   - warming:    1–9 signed quotes — analyst uses similar-jobs layer
 *   - mature:     10–49 signed quotes — analyst uses operator-wide
 *                 learned baseline
 *   - deep:       50+ signed quotes — analyst has rich per-customer
 *                 signal
 *
 * Useful examples:
 *   - "How much of my pricing brain does Setell have built up?"
 *   - "Am I on the cold-start path or my own data path right now?"
 *   - "How many customers have I trained Setell on?"
 *
 * Read-only. Maps to GET /api/mcp/v1/learning-coverage.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  LearningCoverageResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

export function registerGetLearningCoverageTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_get_learning_coverage',
    {
      title: 'Setell learning-loop coverage',
      description:
        "How deep is the operator's vertical-moat data? Returns aggregate " +
        'counts: total SIGNED quotes contributing, distinct customers with ' +
        'learned baselines, jobType-narrowed baseline count, the operator-' +
        'wide baseline (sampleSize + lastSignedAt) if present, and a one-' +
        'word `maturityTier` (`cold-start` / `warming` / `mature` / `deep`) ' +
        "that summarizes the operator's data depth. Use this when the " +
        'operator asks "how much does Setell know about my pricing?" or ' +
        'when narrating analyst verdicts (e.g. "your moat for Cooper is ' +
        'deep — Setell has 12 signed kitchens to compare against"). ' +
        'Read-only.',
      annotations: {
        title: 'Setell learning-loop coverage',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const data = await ctx.api.get(
          '/api/mcp/v1/learning-coverage',
          LearningCoverageResponseSchema,
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_learning_coverage');
        throw err;
      }
    },
  );
}
