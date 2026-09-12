/**
 * Manual smoke test for the render pipeline — no AI provider keys needed.
 * Generates synthetic fixtures (solid-color images, tone-generated "narration"
 * audio) via ffmpeg itself, seeds a job directly in Postgres (skipping
 * script/scene-plan/image/tts entirely), and enqueues a real `render` job on
 * the running worker.
 *
 * Prerequisites: ffmpeg/ffprobe on PATH, Postgres+Redis+MinIO up, and the
 * worker process (`npm run dev -w apps/worker`) running in another terminal.
 *
 * Run: npx tsx src/render/smoke-test.ts
 */
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import dotenv from "dotenv";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { run } from "./exec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const { prisma } = await import("@pipeline/db");
const { ObjectStorage } = await import("@pipeline/storage");

const workDir = path.join(os.tmpdir(), "pipeline-render-smoke-test");
await mkdir(workDir, { recursive: true });

async function makeImage(name: string, color: string) {
  const p = path.join(workDir, name);
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", `color=c=${color}:s=1080x1920`, "-frames:v", "1", p]);
  return p;
}

async function makeTone(name: string, frequency: number, duration: number) {
  const p = path.join(workDir, name);
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=${duration}`, "-c:a", "libmp3lame", p]);
  return p;
}

console.log("Generating synthetic fixtures with ffmpeg...");
const scene1Image = await makeImage("scene1.jpg", "steelblue");
const scene2Image = await makeImage("scene2.jpg", "indianred");
const narration1 = await makeTone("narration1.mp3", 440, 3);
const narration2 = await makeTone("narration2.mp3", 660, 4);
const music = await makeTone("music.mp3", 220, 10);

const storage = new ObjectStorage();
async function upload(localPath: string, key: string, contentType: string) {
  const buf = await readFile(localPath);
  return (await storage.uploadBuffer(key, buf, contentType)).url;
}

console.log("Uploading fixtures to object storage...");
const scene1ImageUrl = await upload(scene1Image, "render-smoke-test/scene1.jpg", "image/jpeg");
const scene2ImageUrl = await upload(scene2Image, "render-smoke-test/scene2.jpg", "image/jpeg");
const narration1Url = await upload(narration1, "render-smoke-test/narration1.mp3", "audio/mpeg");
const narration2Url = await upload(narration2, "render-smoke-test/narration2.mp3", "audio/mpeg");
const musicUrl = await upload(music, "render-smoke-test/music.mp3", "audio/mpeg");

const job = await prisma.job.create({
  data: {
    brief: "[render smoke test] synthetic fixtures, no real AI calls",
    format: "BOTH",
    status: "GENERATING",
    script: "Smoke test script.",
  },
});

const scene1 = await prisma.scene.create({
  data: { jobId: job.id, order: 1, scriptText: "This is the first scene narration for the render smoke test.", visualPrompt: "steelblue test card", status: "SCRIPTED" },
});
const scene2 = await prisma.scene.create({
  data: { jobId: job.id, order: 2, scriptText: "Second scene, a different color and a longer narration.", visualPrompt: "indianred test card", status: "SCRIPTED" },
});

await prisma.asset.createMany({
  data: [
    { jobId: job.id, sceneId: scene1.id, type: "IMAGE", provider: "smoke-test", url: scene1ImageUrl, status: "READY" },
    { jobId: job.id, sceneId: scene1.id, type: "AUDIO", provider: "smoke-test", url: narration1Url, status: "READY" },
    { jobId: job.id, sceneId: scene2.id, type: "IMAGE", provider: "smoke-test", url: scene2ImageUrl, status: "READY" },
    { jobId: job.id, sceneId: scene2.id, type: "AUDIO", provider: "smoke-test", url: narration2Url, status: "READY" },
    { jobId: job.id, type: "MUSIC", provider: "smoke-test", url: musicUrl, status: "READY" },
  ],
});

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const renderQueue = new Queue("render", { connection });
await renderQueue.add("render", { jobId: job.id }, { attempts: 2, backoff: { type: "fixed", delay: 5000 } });

console.log(`\nEnqueued render job for ${job.id}`);
console.log(`Poll: curl http://localhost:3001/jobs/${job.id}`);
console.log("(needs the worker process running separately to actually process it)");

await prisma.$disconnect();
await connection.quit();
