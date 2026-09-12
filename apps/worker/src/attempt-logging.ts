import type { Worker, Job } from "bullmq";
import { prisma } from "@pipeline/db";

interface AttemptSubject {
  jobId: string;
  subjectType: string;
  subjectId: string;
}

/**
 * Durable retry-gate history (per the build plan's review_gate() design): every
 * BullMQ attempt — pass or fail — becomes a row in the `attempts` table, and a
 * terminally-failed job (all retries exhausted) flips the parent Job to FAILED.
 * Centralized here so every worker gets this for free instead of duplicating
 * try/catch bookkeeping per processor.
 */
export function attachAttemptLogging(
  worker: Worker,
  gateName: string,
  getSubject: (job: Job) => AttemptSubject,
) {
  worker.on("completed", async (job) => {
    const subject = getSubject(job);
    await prisma.attempt.create({
      data: {
        jobId: subject.jobId,
        gateName,
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        attemptNumber: job.attemptsMade + 1,
        verdict: "PASS",
      },
    });
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const subject = getSubject(job);
    await prisma.attempt.create({
      data: {
        jobId: subject.jobId,
        gateName,
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        attemptNumber: job.attemptsMade,
        verdict: "FAIL",
        feedback: err.message,
      },
    });

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      await prisma.job.update({
        where: { id: subject.jobId },
        data: { status: "FAILED", latestError: `${gateName}: ${err.message}` },
      });
    }
  });
}
