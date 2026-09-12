import { Worker, type Job } from "bullmq";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prisma } from "@pipeline/db";
import { ObjectStorage } from "@pipeline/storage";
import { attachAttemptLogging } from "../attempt-logging.js";
import { QUEUE_NAMES } from "../queues.js";
import { downloadToFile } from "../render/download.js";
import { padToLandscape } from "../render/pad-landscape.js";
import { renderVariant, type RenderScene } from "../render/pipeline.js";
import type { Redis } from "ioredis";

export interface RenderJobData {
  jobId: string;
}

interface Variant {
  tag: string;
  width: number;
  height: number;
  usesPadding: boolean;
}

function variantsFor(format: string): Variant[] {
  if (format === "LANDSCAPE") return [{ tag: "landscape", width: 1920, height: 1080, usesPadding: false }];
  if (format === "BOTH") {
    return [
      { tag: "vertical", width: 1080, height: 1920, usesPadding: false },
      { tag: "landscape", width: 1920, height: 1080, usesPadding: true },
    ];
  }
  return [{ tag: "vertical", width: 1080, height: 1920, usesPadding: false }];
}

export function createRenderWorker(connection: Redis) {
  const storage = new ObjectStorage();

  const worker = new Worker<RenderJobData>(
    QUEUE_NAMES.render,
    async (job: Job<RenderJobData>) => {
      const { jobId } = job.data;

      const dbJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      if (dbJob.status === "FAILED") {
        throw new Error(`Job ${jobId} already failed upstream — skipping render`);
      }

      const scenes = await prisma.scene.findMany({
        where: { jobId },
        orderBy: { order: "asc" },
        include: { assets: true },
      });
      if (scenes.length === 0) {
        throw new Error(`Job ${jobId} has no scenes to render`);
      }

      const musicAsset = await prisma.asset.findFirst({ where: { jobId, type: "MUSIC" } });

      const workDir = path.join(os.tmpdir(), "pipeline-render", jobId);
      await mkdir(workDir, { recursive: true });

      try {
        // Download each scene's source image once — reused as-is for the
        // native-orientation pass, padded (not re-downloaded) for the other.
        const originals: Array<{ order: number; narration: string; audioUrl: string; originalImagePath: string }> = [];
        for (const scene of scenes) {
          const imageAsset = scene.assets.find((a) => a.type === "IMAGE");
          const audioAsset = scene.assets.find((a) => a.type === "AUDIO");
          if (!imageAsset?.url || !audioAsset?.url) {
            throw new Error(`Scene ${scene.id} (order ${scene.order}) is missing its image or audio asset`);
          }
          const originalImagePath = path.join(workDir, `source-${scene.order}.jpg`);
          await downloadToFile(imageAsset.url, originalImagePath);
          originals.push({
            order: scene.order,
            narration: scene.scriptText ?? "",
            audioUrl: audioAsset.url,
            originalImagePath,
          });
        }

        const finalAssetUrls: string[] = [];

        for (const variant of variantsFor(dbJob.format)) {
          const renderScenes: RenderScene[] = [];
          for (const scene of originals) {
            let imagePath = scene.originalImagePath;
            if (variant.usesPadding) {
              imagePath = path.join(workDir, `padded-${variant.tag}-${scene.order}.jpg`);
              await padToLandscape(scene.originalImagePath, imagePath, variant.width, variant.height);
            }
            renderScenes.push({
              order: scene.order,
              narration: scene.narration,
              imagePath,
              audioUrl: scene.audioUrl,
            });
          }

          const finalLocalPath = await renderVariant({
            workDir,
            variantTag: variant.tag,
            width: variant.width,
            height: variant.height,
            scenes: renderScenes,
            musicUrl: musicAsset?.url,
          });

          const buffer = await readFile(finalLocalPath);
          const uploaded = await storage.uploadBuffer(
            `jobs/${jobId}/final-${variant.tag}.mp4`,
            buffer,
            "video/mp4",
          );

          await prisma.asset.create({
            data: { jobId, type: "FINAL", provider: "ffmpeg", url: uploaded.url, status: "READY" },
          });
          finalAssetUrls.push(uploaded.url);
        }

        await prisma.job.update({ where: { id: jobId }, data: { status: "QA" } });

        return { finalAssetUrls };
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
    { connection, concurrency: 2 },
  );

  attachAttemptLogging(worker, "render", (job) => ({
    jobId: job.data.jobId,
    subjectType: "job",
    subjectId: job.data.jobId,
  }));

  return worker;
}
