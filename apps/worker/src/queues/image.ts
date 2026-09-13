import { Worker, type Job } from "bullmq";
import { prisma } from "@pipeline/db";
import { createImageProvider } from "@pipeline/providers";
import { attachAttemptLogging } from "../attempt-logging.js";
import { recordCostEvent, imageCostUsd } from "../costs.js";
import { QUEUE_NAMES } from "../queues.js";
import { reviewGate, ReviewGateError, failJobFromQA } from "../qa/review-gate.js";
import { validateImage } from "../qa/validators.js";
import type { Redis } from "ioredis";

export interface ImageJobData {
  jobId: string;
  sceneId: string;
  prompt: string;
  width: number;
  height: number;
}

function orientationOf(width: number, height: number): "portrait" | "landscape" | "square" {
  if (width === height) return "square";
  return width < height ? "portrait" : "landscape";
}

export function createImageWorker(connection: Redis) {
  const imageProvider = createImageProvider();

  const worker = new Worker<ImageJobData>(
    QUEUE_NAMES.image,
    async (job: Job<ImageJobData>) => {
      const { jobId, sceneId, prompt, width, height } = job.data;
      const orientation = orientationOf(width, height);

      let result: Awaited<ReturnType<typeof imageProvider.generateImage>>;
      try {
        result = await reviewGate({
          jobId,
          gateName: "image_qa",
          subjectType: "scene",
          subjectId: sceneId,
          maxAttempts: 2,
          attempt: (feedback) =>
            imageProvider.generateImage({
              prompt: feedback ? `${prompt}. (${feedback}, keep it safe-for-work)` : prompt,
              width,
              height,
            }),
          validate: (candidate) => validateImage(candidate.url, candidate.flagged, orientation),
        });
      } catch (err) {
        if (err instanceof ReviewGateError) {
          await failJobFromQA(jobId, err);
          return { failed: true, reason: err.message };
        }
        throw err;
      }

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
