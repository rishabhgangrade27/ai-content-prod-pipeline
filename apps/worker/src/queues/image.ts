import { Worker, type Job } from "bullmq";
import { prisma } from "@pipeline/db";
import { createImageProvider } from "@pipeline/providers";
import { attachAttemptLogging } from "../attempt-logging.js";
import { recordCostEvent, imageCostUsd } from "../costs.js";
import { QUEUE_NAMES } from "../queues.js";
import type { Redis } from "ioredis";

export interface ImageJobData {
  jobId: string;
  sceneId: string;
  prompt: string;
  width: number;
  height: number;
}

export function createImageWorker(connection: Redis) {
  const imageProvider = createImageProvider();

  const worker = new Worker<ImageJobData>(
    QUEUE_NAMES.image,
    async (job: Job<ImageJobData>) => {
      const { jobId, sceneId, prompt, width, height } = job.data;

      const result = await imageProvider.generateImage({ prompt, width, height });

      await prisma.asset.create({
        data: {
          jobId,
          sceneId,
          type: "IMAGE",
          provider: result.provider,
          url: result.url,
          status: "READY",
        },
      });

      await recordCostEvent(jobId, "image_generation", result.provider, 1, imageCostUsd(width, height));

      return result.url;
    },
    { connection, concurrency: 3 },
  );

  attachAttemptLogging(worker, "image_generation", (job) => ({
    jobId: job.data.jobId,
    subjectType: "scene",
    subjectId: job.data.sceneId,
  }));

  return worker;
}
