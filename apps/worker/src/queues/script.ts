import { Worker, Queue, type Job } from "bullmq";
import { prisma } from "@pipeline/db";
import { createLLMProvider } from "@pipeline/providers";
import { attachAttemptLogging } from "../attempt-logging.js";
import { recordCostEvent, estimateLLMCostUsd } from "../costs.js";
import { QUEUE_NAMES, RETRY_OPTS } from "../queues.js";
import { reviewGate, ReviewGateError, failJobFromQA } from "../qa/review-gate.js";
import { validateScript } from "../qa/validators.js";
import type { Redis } from "ioredis";

export interface ScriptJobData {
  jobId: string;
}

export function createScriptWorker(connection: Redis) {
  const scenePlanQueue = new Queue(QUEUE_NAMES.scenePlan, { connection });
  const llm = createLLMProvider();

  const worker = new Worker<ScriptJobData>(
    QUEUE_NAMES.script,
    async (job: Job<ScriptJobData>) => {
      const { jobId } = job.data;

      const dbJob = await prisma.job.update({
        where: { id: jobId },
        data: { status: "PLANNING" },
      });

      let script: string;
      try {
        script = await reviewGate({
          jobId,
          gateName: "script_qa",
          subjectType: "job",
          subjectId: jobId,
          maxAttempts: 2,
          attempt: (feedback) => llm.generateScript(dbJob.brief, feedback ?? undefined),
          validate: (candidate) => Promise.resolve(validateScript(candidate)),
        });
      } catch (err) {
        if (err instanceof ReviewGateError) {
          await failJobFromQA(jobId, err);
          return { failed: true, reason: err.message };
        }
        throw err;
      }

      await recordCostEvent(
        jobId,
        "script_generation",
        "claude-haiku-4-5",
        1,
        estimateLLMCostUsd(dbJob.brief.length, script.length),
      );

      await prisma.job.update({ where: { id: jobId }, data: { script } });

      await scenePlanQueue.add(
        "generate",
        { jobId },
        { attempts: RETRY_OPTS.scenePlan.attempts, backoff: RETRY_OPTS.scenePlan.backoff },
      );

      return { script };
    },
    { connection, concurrency: 5 },
  );

  attachAttemptLogging(worker, "script_generation", (job) => ({
    jobId: job.data.jobId,
    subjectType: "job",
    subjectId: job.data.jobId,
  }));

  return worker;
}
