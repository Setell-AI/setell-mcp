/**
 * /setell-moat-coverage — narrate the operator's vertical-moat depth.
 *
 * Uses `setell_get_learning_coverage` (PR #228) to surface how much
 * customer-data signal the pricing-analyst has to work with. Returns
 * a one-paragraph narrative: maturity tier, customer breadth, sample-
 * size depth, and what the next milestone is.
 *
 * Useful when an operator asks "how much does Setell actually know
 * about my pricing?" or when an intermediary is sizing up whether to
 * trust analyst pushback on a new customer.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerMoatCoveragePrompt(server: McpServer): void {
  server.registerPrompt(
    'setell-moat-coverage',
    {
      title: "Narrate the operator's Setell moat depth",
      description:
        "Summarize how deep the operator's customer-data learning loop " +
        'is. Returns a one-paragraph narrative covering maturity tier, ' +
        'customer breadth, sample-size depth, and the next-tier ' +
        "threshold. Use when answering 'how much does Setell know about " +
        "my pricing?' or when sizing up whether to trust analyst " +
        'pushback on a new account.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Summarize my Setell moat depth in one paragraph.\n\n' +
              '1. Call `setell_get_learning_coverage`.\n' +
              "2. Translate the response into a single short paragraph in " +
              "the operator's voice:\n" +
              "   - Lead with maturityTier ('cold-start' / 'warming' / " +
              "'mature' / 'deep'). Don't quote the field name — phrase it " +
              "naturally ('You're at the mature tier' or 'Setell has " +
              "deep per-customer signal for you').\n" +
              "   - Cite the concrete numbers: totalSignedQuotes, " +
              'customersWithBaseline. Surface jobTypeBaselines if > 0.\n' +
              "   - For non-`deep` tiers, name the next milestone: at " +
              "10 signed quotes the analyst graduates to operator-wide " +
              "baseline; at 50 it has rich per-customer signal.\n" +
              "   - For `cold-start`, frame it as a feature: the analyst " +
              "currently uses industry-benchmark cold-start data so the " +
              "operator gets some pushback from day one, but their own " +
              "data will start mattering after their first signed quote.\n" +
              '3. End with one-line guidance: what to do next ("keep ' +
              'signing quotes to deepen the moat" / "your data is ' +
              'rich enough to trust the analyst aggressively").\n\n' +
              "Voice: direct, terse, opinionated. Don't list fields; " +
              'narrate. Pad nothing.',
          },
        },
      ],
    }),
  );
}
