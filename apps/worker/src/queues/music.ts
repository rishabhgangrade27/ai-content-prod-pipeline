import { Worker, type Job } from "bullmq";
import { prisma } from "@pipeline/db";
import { createMusicProvider } from "@pipeline/providers";
import { attachAttemptLogging } from "../attempt-logging.js";
import { recordCostEvent } from "../costs.js";
import { QUEUE_NAMES } from "../queues.js";
import type { Redis } from "ioredis";

export interface MusicJobData {
  jobId: string;
  query: string;
}

export function createMusicWorker(connection: Redis) {
  const musicProvider = createMusicProvider();

  const worker = new Worker<MusicJobData>(
    QUEUE_NAMES.music,
    async (job: Job<MusicJobData>) => {
      const { jobId, query } = job.data;

      const track = await musicProvider.findTrack({ query, maxDurationSeconds: 30 });

      // No CC0/Attribution track matched — degrade gracefully (video with no
      // background music) rather than failing the whole job over an
      // optional enhancement, same pattern as agentcut's music stage.
      if (!track) {
        return null;
      }

      await prisma.asset.create({
        data: {
          jobId,
          type: "MUSIC",
          provider: track.provider,
          url: track.previewUrl,
          status: "READY",
        },
      });

      await recordCostEvent(jobId, "music_selection", track.provider, 1, 0);

      return track.previewUrl;
    },
    { connection, concurrency: 5 },
  );

  attachAttemptLogging(worker, "music_selection", (job) => ({
    jobId: job.data.jobId,
    subjectType: "job",
    subjectId: job.data.jobId,
  }));

  return worker;
}
