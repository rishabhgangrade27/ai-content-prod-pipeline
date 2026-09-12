import { Redis } from "ioredis";

/**
 * BullMQ Workers use blocking Redis commands internally and require
 * maxRetriesPerRequest: null, or ioredis throws on blocked commands.
 * Producers (plain Queue.add callers) don't need this — see apps/api's
 * own connection, which intentionally keeps ioredis's default retry
 * behavior so a Redis blip fails an HTTP request fast instead of hanging.
 */
export function createWorkerConnection(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}
