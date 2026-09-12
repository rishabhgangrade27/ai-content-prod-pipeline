import { Redis } from "ioredis";
import { Queue } from "bullmq";

// Producer connection — deliberately keeps ioredis's default retry behavior
// (unlike the worker's connection) so a Redis blip fails a request fast
// instead of hanging it. See apps/worker/src/redis.ts for the contrast.
const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export const scriptQueue = new Queue("script", { connection });

export const SCRIPT_RETRY_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
};
