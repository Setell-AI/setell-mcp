/**
 * setell_get_pricing_signal — the frontier MCP capability.
 *
 * Lets ANY external agent (Claude Code, Claude.ai, Cursor, ChatGPT) call
 * into Setell's pricing brain on demand. The calling agent passes a
 * jobId; Setell runs its pricing-analyst (Sonnet + extended thinking,
 * 4-layer comparable hierarchy: CustomerLearnedBaseline → operator-wide
 * → similar-jobs → industry benchmark) and returns a structured verdict
 * with voice-attributed evidence.
 *
 * The calling agent renders the pushback in its own voice. In-app Boxx
 * does the synthesis itself; the MCP surface gives external agents the
 * same brain. This is the canonical *Product Surface Architecture* parity
 * play — vertical brain exposed as an MCP primitive Claude calls.
 *
 * Read-only — the analyst's verdict is NOT recorded on
 * QuoteSendConfirmation by this path (only the in-app send_quote pre-hook
 * does that). Calling this tool burns ~1 Sonnet call against the
 * operator's daily AI budget, governed server-side by tracedAnthropicCall.
 *
 * Maps to GET /api/mcp/v1/pricing-signal?jobId=...
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  PricingSignalResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'The job id whose latest quote to evaluate. Find it via setell_find_jobs ' +
        'or setell://jobs resource. The analyst always evaluates the LATEST quote ' +
        'version on the job.',
    ),
};

export function registerGetPricingSignalTool(
  server: McpServer,
  ctx: ToolRegistrationContext,
): void {
  server.registerTool(
    'setell_get_pricing_signal',
    {
      title: 'Setell pricing signal',
      description:
        "Get Setell's pricing-analyst verdict on a quote BEFORE you send it. " +
        "Setell compares the quote's total against the operator's own history " +
        '(per-customer, per-job-type, similar past jobs) and falls back to an ' +
        'industry benchmark when no operator data exists. Returns: ' +
        '`verdict` (PASS / WARN / FLAG), `reasoning` (one paragraph in the ' +
        "operator's voice), optional `recommendedAmount` counter, `comparables` " +
        '(structured evidence), `layer` (which hierarchy level fired), and ' +
        '`priceResponse` (win-rate-by-price-position curve + expected-profit peak; ' +
        'FORMING status = withhold recommendation framing). ' +
        'Use this before send_quote-style actions to surface pushback in your ' +
        'own voice. FLAG verdicts always warrant a confirmation prompt; ' +
        'WARN is autonomy-mode-dependent. Read-only.',
      annotations: {
        title: 'Setell pricing signal',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { jobId } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.get('/api/mcp/v1/pricing-signal', PricingSignalResponseSchema, {
          jobId,
        });
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_get_pricing_signal');
        throw err;
      }
    },
  );
}
