import { Worker, FlowProducer, type Job } from "bullmq";
import { prisma } from "@pipeline/db";
import { createLLMProvider } from "@pipeline/providers";
import { attachAttemptLogging } from "../attempt-logging.js";
import { QUEUE_NAMES, RETRY_OPTS } from "../queues.js";
import type { Redis } from "ioredis";
import type { ImageJobData } from "./image.js";
import type { TTSJobData } from "./tts.js";
import type { MusicJobData } from "./music.js";

export interface ScenePlanJobData {
  jobId: string;
}

/** VERTICAL/LANDSCAPE pick their native size; BOTH generates once at the
 * vertical size — Stage 4's FFmpeg render derives the other aspect ratio via
 * crop/pad rather than paying for a second image generation per scene. */
function imageDimensions(format: string): { width: number; height: number } {
  if (format === "LANDSCAPE") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}

export function createScenePlanWorker(connection: Redis) {
  const flowProducer = new FlowProducer({ connection });
  const llm = createLLMProvider();

  const worker = new Worker<ScenePlanJobData>(
    QUEUE_NAMES.scenePlan,
    async (job: Job<ScenePlanJobData>) => {
      const { jobId } = job.data;

      const dbJob = await prisma.job.update({
        where: { id: jobId },
        data: { status: "GENERATING" },
      });

      if (!dbJob.script) {
        throw new Error(`Job ${jobId} has no script — script stage must run first`);
      }

      const breakdown = await llm.generateSceneBreakdown(dbJob.brief, dbJob.script);

      const scenes = await prisma.$transaction(
        breakdown.scenes.map((scene) =>
          prisma.scene.create({
            data: {
              jobId,
              order: scene.order,
              scriptText: scene.narration,
              visualPrompt: scene.visualPrompt,
              status: "SCRIPTED",
            },
          }),
        ),
      );

      const { width, height } = imageDimensions(dbJob.format);

      type FlowChild = { name: string; queueName: string; data: unknown; opts: object };

      const children: FlowChild[] = scenes.flatMap((scene) => [
        {
          name: "generate",
          queueName: QUEUE_NAMES.image,
          data: { jobId, sceneId: scene.id, prompt: scene.visualPrompt ?? "", width, height } satisfies ImageJobData,
          opts: { attempts: RETRY_OPTS.image.attempts, backoff: RETRY_OPTS.image.backoff },
        },
        {
          name: "generate",
          queueName: QUEUE_NAMES.tts,
          data: { jobId, sceneId: scene.id, text: scene.scriptText ?? "" } satisfies TTSJobData,
          opts: { attempts: RETRY_OPTS.tts.attempts, backoff: RETRY_OPTS.tts.backoff },
        },
      ]);

      children.push({
        name: "generate",
        queueName: QUEUE_NAMES.music,
        data: { jobId, query: `background music for: ${dbJob.brief}` } satisfies MusicJobData,
        opts: { attempts: RETRY_OPTS.music.attempts, backoff: RETRY_OPTS.music.backoff },
      });

      await flowProducer.add({
        name: "aggregate",
        queueName: QUEUE_NAMES.renderPrep,
        data: { jobId },
        opts: { attempts: RETRY_OPTS.renderPrep.attempts },
        children,
      });

      return { sceneCount: scenes.length };
    },
    { connection, concurrency: 5 },
  );

  attachAttemptLogging(worker, "scene_planning", (job) => ({
    jobId: job.data.jobId,
    subjectType: "job",
    subjectId: job.data.jobId,
  }));

  return worker;
}
