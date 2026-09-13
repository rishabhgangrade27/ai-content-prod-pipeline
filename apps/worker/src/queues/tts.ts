import { Worker, type Job } from "bullmq";
import { prisma } from "@pipeline/db";
import { createTTSProvider } from "@pipeline/providers";
import { ObjectStorage } from "@pipeline/storage";
import { attachAttemptLogging } from "../attempt-logging.js";
import { recordCostEvent, ttsCostUsd } from "../costs.js";
import { QUEUE_NAMES } from "../queues.js";
import { reviewGate, ReviewGateError, failJobFromQA } from "../qa/review-gate.js";
import { validateAudio } from "../qa/validators.js";
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

      let synthesized: Awaited<ReturnType<typeof ttsProvider.synthesize>>;
      let uploadedUrl: string;
      try {
        const outcome = await reviewGate({
          jobId,
          gateName: "tts_qa",
          subjectType: "scene",
          subjectId: sceneId,
          maxAttempts: 2,
          attempt: async () => {
            const result = await ttsProvider.synthesize({ text });
            const uploaded = await storage.uploadBuffer(
              `jobs/${jobId}/scenes/${sceneId}/narration.mp3`,
              result.audio,
              result.contentType,
            );
            return { result, url: uploaded.url };
          },
          validate: (candidate) => validateAudio(candidate.url),
        });
        synthesized = outcome.result;
        uploadedUrl = outcome.url;
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
          type: "AUDIO",
          provider: synthesized.provider,
          url: uploadedUrl,
          status: "READY",
        },
      });

      await recordCostEvent(jobId, "tts_generation", synthesized.provider, text.length, ttsCostUsd(text.length));

      return uploadedUrl;
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
