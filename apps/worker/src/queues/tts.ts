import { Worker, type Job } from "bullmq";
import { prisma } from "@pipeline/db";
import { createTTSProvider } from "@pipeline/providers";
import { ObjectStorage } from "@pipeline/storage";
import { attachAttemptLogging } from "../attempt-logging.js";
import { recordCostEvent, ttsCostUsd } from "../costs.js";
import { QUEUE_NAMES } from "../queues.js";
import type { Redis } from "ioredis";

export interface TTSJobData {
  jobId: string;
  sceneId: string;
  text: string;
}

export function createTTSWorker(connection: Redis) {
  const ttsProvider = createTTSProvider();
  const storage = new ObjectStorage();

  const worker = new Worker<TTSJobData>(
    QUEUE_NAMES.tts,
    async (job: Job<TTSJobData>) => {
      const { jobId, sceneId, text } = job.data;

      const result = await ttsProvider.synthesize({ text });
      const uploaded = await storage.uploadBuffer(
        `jobs/${jobId}/scenes/${sceneId}/narration.mp3`,
        result.audio,
        result.contentType,
      );

      await prisma.asset.create({
        data: {
          jobId,
          sceneId,
          type: "AUDIO",
          provider: result.provider,
          url: uploaded.url,
          status: "READY",
        },
      });

      await recordCostEvent(jobId, "tts_generation", result.provider, text.length, ttsCostUsd(text.length));

      return uploaded.url;
    },
    { connection, concurrency: 5 },
  );

  attachAttemptLogging(worker, "tts_generation", (job) => ({
    jobId: job.data.jobId,
    subjectType: "scene",
    subjectId: job.data.sceneId,
  }));

  return worker;
}
