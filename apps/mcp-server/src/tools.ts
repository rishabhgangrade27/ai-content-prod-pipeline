import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as api from "./api-client.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function summarizeJob(job: api.JobSummary): string {
  return `Job ${job.id} — status: ${job.status}${job.latestError ? ` (error: ${job.latestError})` : ""}`;
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "create_job",
    {
      title: "Create content production job",
      description:
        "Starts a new AI content production job from a creative brief. Kicks off script generation, " +
        "scene planning, asset generation, and rendering automatically — poll get_job_status for progress.",
      inputSchema: z.object({
        brief: z.string().min(1).describe("The creative brief / ad concept to produce a video for"),
        format: z
          .enum(["VERTICAL", "LANDSCAPE", "BOTH"])
          .optional()
          .describe("Output aspect ratio(s). Defaults to VERTICAL (9:16)."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ brief, format }) => {
      const job = await api.createJob({ brief, format });
      return textResult(`Created ${summarizeJob(job)}`);
    },
  );

  server.registerTool(
    "get_job_status",
    {
      title: "Get job status",
      description:
        "Fetches full status for one job: current pipeline stage, scenes, generated assets, " +
        "QA attempt history, and any human review decisions.",
      inputSchema: z.object({ jobId: z.string().describe("The job id returned by create_job") }),
      annotations: { readOnlyHint: true },
    },
    async ({ jobId }) => {
      const job = await api.getJob(jobId);
      const lines = [
        summarizeJob(job),
        job.script ? `Script: ${job.script}` : "Script: (not generated yet)",
        `Scenes: ${job.scenes.length}`,
        `Assets: ${job.assets.map((a) => `${a.type}:${a.status}`).join(", ") || "(none yet)"}`,
        job.attempts.length > 0
          ? `Recent QA attempts:\n${job.attempts
              .slice(-5)
              .map((a) => `  ${a.gateName} #${a.attemptNumber} ${a.verdict}${a.feedback ? ` — ${a.feedback}` : ""}`)
              .join("\n")}`
          : "No QA attempts logged yet.",
      ];
      return textResult(lines.join("\n"));
    },
  );

  server.registerTool(
    "list_pending_reviews",
    {
      title: "List jobs awaiting human review",
      description:
        "Lists every job that has passed automated QA and is waiting for a human approve/reject decision.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const jobs = await api.listJobs("REVIEW");
      if (jobs.length === 0) {
        return textResult("No jobs are currently awaiting review.");
      }
      return textResult(jobs.map((j) => `${j.id} — "${j.brief}"`).join("\n"));
    },
  );

  server.registerTool(
    "approve_review",
    {
      title: "Approve a job's output",
      description: "Approves a job that's awaiting review, clearing it for delivery.",
      inputSchema: z.object({
        jobId: z.string(),
        reviewer: z.string().describe("Name/identifier of the person approving"),
        comment: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ jobId, reviewer, comment }) => {
      const { job } = await api.reviewJob(jobId, "APPROVED", reviewer, comment);
      return textResult(`Approved. ${summarizeJob(job)}`);
    },
  );

  server.registerTool(
    "reject_review",
    {
      title: "Reject a job's output",
      description:
        "Rejects a job that's awaiting review. Use trigger_regeneration afterward to start over from scratch.",
      inputSchema: z.object({
        jobId: z.string(),
        reviewer: z.string().describe("Name/identifier of the person rejecting"),
        comment: z.string().optional().describe("Why this was rejected — helps decide what to fix before regenerating"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ jobId, reviewer, comment }) => {
      const { job } = await api.reviewJob(jobId, "REJECTED", reviewer, comment);
      return textResult(`Rejected. ${summarizeJob(job)}`);
    },
  );

  server.registerTool(
    "trigger_regeneration",
    {
      title: "Regenerate a job from scratch",
      description:
        "Wipes a REJECTED or FAILED job's scenes/assets/QA history and restarts the whole pipeline from " +
        "script generation. Only works on jobs in REJECTED or FAILED status.",
      inputSchema: z.object({ jobId: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ jobId }) => {
      const job = await api.regenerateJob(jobId);
      return textResult(`Regeneration started. ${summarizeJob(job)}`);
    },
  );
}
