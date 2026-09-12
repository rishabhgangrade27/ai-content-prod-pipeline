import "./env.js";

import { createWorkerConnection } from "./redis.js";
import { createScriptWorker } from "./queues/script.js";
import { createScenePlanWorker } from "./queues/scene-plan.js";
import { createImageWorker } from "./queues/image.js";
import { createTTSWorker } from "./queues/tts.js";
import { createMusicWorker } from "./queues/music.js";
import { createRenderPrepWorker } from "./queues/render-prep.js";
import { createRenderWorker } from "./queues/render.js";

const connection = createWorkerConnection();

const workers = [
  createScriptWorker(connection),
  createScenePlanWorker(connection),
  createImageWorker(connection),
  createTTSWorker(connection),
  createMusicWorker(connection),
  createRenderPrepWorker(connection),
  createRenderWorker(connection),
];

for (const worker of workers) {
  worker.on("error", (err) => {
    console.error(`[${worker.name}] worker error:`, err);
  });
}

console.log(`Worker process started — listening on: ${workers.map((w) => w.name).join(", ")}`);

async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
