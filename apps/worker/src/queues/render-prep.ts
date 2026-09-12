import { Worker, Queue, type Job } from "bullmq";
import { prisma } from "@pipeline/db";
import { attachAttemptLogging } from "../attempt-logging.js";
import { QUEUE_NAMES, RETRY_OPTS } from "../queues.js";
import type { Redis } from "ioredis";

export interface RenderPrepJobData {
  jobId: string;
}

/**
 * Fan-in point: this parent job only runs once every image/tts/music child
 * (added via FlowProducer in scene-plan.ts) has reached a terminal state.
 * Hands off to the `render` queue (Stage 4's FFmpeg pipeline). Partial-failure
 * handling (some scenes missing an image after all retries) is Stage 5's
 * QA/review-gate job, not this one.
 */
export function createRenderPrepWorker(connection: Redis) {
  const renderQueue = new Queue(QUEUE_NAMES.render, { connection });

  const worker = new Worker<RenderPrepJobData>(
    QUEUE_NAMES.renderPrep,
    async (job: Job<RenderPrepJobData>) => {
      const { jobId } = job.data;

      const childrenValues = await job.getChildrenValues();
      const assetUrls = Object.values(childrenValues).filter((v): v is string => typeof v === "string");

      await prisma.job.update({
        where: { id: jobId },
        data: { status: "RENDERING" },
      });

      await renderQueue.add(
        "render",
        { jobId },
        { attempts: RETRY_OPTS.render.attempts, backoff: RETRY_OPTS.render.backoff },
      );

      return { assetCount: assetUrls.length };
    },
    { connection, concurrency: 5 },
  );

  attachAttemptLogging(worker, "render_prep", (job) => ({
    jobId: job.data.jobId,
    subjectType: "job",
    subjectId: job.data.jobId,
  }));

  return worker;
}
