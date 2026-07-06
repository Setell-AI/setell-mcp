/**
 * /setell-customer-history — load a customer's full Setell context.
 *
 * Per BET-3-SETELL-MCP-V0.md §2.3, this is the "warm-up the context" prompt.
 * The intermediary types `/setell-customer-history customer: Smith`; the
 * prompt expands into a structured message that resolves the customer +
 * attaches their context resources, leaving the agent ready to answer the
 * next question with full context loaded.
 *
 * This is the single prompt that most directly proves the resources surface:
 * the customer history is too big to dump into a tool result, but exactly
 * right as an `@`-attached resource the agent reads on demand.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerCustomerHistoryPrompt(server: McpServer): void {
  server.registerPrompt(
    'setell-customer-history',
    {
      title: 'Load Setell customer history',
      description:
        "Resolve a customer by name + attach their full Setell context " +
        '(profile, past jobs, customer memory) so the next question lands ' +
        'with all of it loaded.',
      argsSchema: {
        customer: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "Customer name, email, or company. Partial match is fine — " +
              "`setell_find_customer` does fuzzy resolution.",
          ),
      },
    },
    (args) => {
      // SDK guarantees args.customer is present + non-empty via argsSchema.
      // Defensive trim handles whitespace from copy-paste.
      const query = args.customer.trim();
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Load context for the Setell customer matching "${query}".\n\n` +
                `1. Call \`setell_find_customer\` with \`query: "${query}"\`.\n` +
                '2. If exactly one match: attach `setell://customers/{id}` and ' +
                '`setell://customers/{id}/history` to this conversation. Confirm ' +
                "the match with one line ('Loaded context for Smith Construction " +
                "— 12 jobs, $84K lifetime, last seen 14 days ago').\n" +
                '3. If multiple matches: list them with the disambiguating ' +
                "fields (email, jobCount, lastJobAt). Don't attach resources " +
                "— ask the user which one and stop. Don't guess.\n" +
                "4. If zero matches: say so plainly and stop. Don't speculate " +
                'or attach the closest non-match.\n\n' +
                'After context is loaded, the user will ask follow-up ' +
                'questions — drafting an email, checking pricing patterns, ' +
                'pulling a specific past quote. Answer those with the ' +
                "loaded resources, not by re-querying.",
            },
          },
        ],
      };
    },
  );
}
