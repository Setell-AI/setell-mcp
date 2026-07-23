/**
 * setell_add_job_context — attach freeform scoping notes to a job so they
 * feed quote drafting.
 *
 * Mirrors the in-app `add_job_context` Boxx tool. The field-capture write
 * path: an estimator (or the operator's agent) narrates site-visit /
 * walkthrough observations, phone-call notes, or dictated measurements, and
 * they land on the job as a SCOPING_INPUT text artifact — draft evidence the
 * next time a quote is drafted, exactly like an uploaded PDF or site photo.
 * The note is private to the operator (never customer-visible unless they
 * share it from the artifacts panel).
 *
 * Maps to POST /api/mcp/v1/jobs/{id}/context.
 *
 * Mutator — `destructiveHint: true` because it creates an artifact row that
 * feeds subsequent drafts. `openWorldHint: false` because the operation is
 * fully scoped to the operator's own job.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError } from '../api-client.js';
import type { ToolRegistrationContext } from './index.js';
import {
  AddJobContextResponseSchema,
  errorResultFromApi,
  successResultFromJson,
} from './_shared.js';

const InputShape = {
  jobId: z
    .string()
    .min(1)
    .max(64)
    .describe('The job these notes belong to. Find it via setell_find_jobs.'),
  content: z
    .string()
    .min(10)
    .max(10_000)
    .describe(
      'The notes, 10-10,000 characters. Preserve the operator’s wording — ' +
        'measurements, site conditions, access constraints, materials mentioned. ' +
        'Do not summarize away specifics; they become quote-draft evidence.',
    ),
  label: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe(
      "Short label for the note, e.g. 'site walkthrough' or 'call with Dana' " +
        '(becomes the artifact filename). Omit for the default.',
    ),
};

export function registerAddJobContextTool(server: McpServer, ctx: ToolRegistrationContext): void {
  server.registerTool(
    'setell_add_job_context',
    {
      title: 'Setell add job context',
      description:
        'Attach freeform scoping notes to a job — site-visit / walkthrough ' +
        'observations, phone-call notes, dictated measurements, verbal scope ' +
        'details from the customer. The text is stored as a job artifact ' +
        '(private to the operator) and its content feeds the next quote draft ' +
        'for the job, exactly like an uploaded PDF or photo. Use when the ' +
        "operator narrates field notes ('here's what I saw on site…'). Do NOT " +
        'use for durable facts about a customer relationship ' +
        '(setell_save_customer_memory). Mutator — creates an Artifact row.',
      annotations: {
        title: 'Setell add job context',
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      inputSchema: InputShape,
    },
    async (params) => {
      const { jobId, content, label } = params as z.infer<z.ZodObject<typeof InputShape>>;
      try {
        const data = await ctx.api.post(
          `/api/mcp/v1/jobs/${encodeURIComponent(jobId)}/context`,
          AddJobContextResponseSchema,
          {
            content,
            ...(label ? { label } : {}),
          },
        );
        return successResultFromJson(data);
      } catch (err) {
        if (err instanceof ApiError) return errorResultFromApi(err, 'setell_add_job_context');
        throw err;
      }
    },
  );
}
