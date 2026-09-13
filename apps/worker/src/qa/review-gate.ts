import { prisma } from "@pipeline/db";

export interface QAVerdict {
  pass: boolean;
  /** Required when pass is false — becomes both the next attempt's
   * regeneration feedback and the Attempt row's durable failure reason. */
  feedback?: string;
}

export interface ReviewGateOptions<T> {
  jobId: string;
  gateName: string;
  subjectType: string;
  subjectId: string;
  maxAttempts: number;
  /** Produces one candidate result. `feedback` is null on the first attempt,
   * then carries the previous attempt's QA failure reason. */
  attempt: (feedback: string | null, attemptNumber: number) => Promise<T>;
  validate: (result: T) => Promise<QAVerdict>;
}

/**
 * The retry-with-feedback QA loop (video-factory's review_gate() pattern
 * from the original research, reimplemented against Postgres instead of a
 * flat JSON checkpoint file): call attempt(), validate the result, and on
 * failure retry with the validator's own feedback — not a blind repeat.
 * Every attempt (pass or fail) is a durable row in `attempts`, distinct from
 * attachAttemptLogging's BullMQ-transport-level rows (different gate names)
 * because they answer different questions: "did the API call throw" vs
 * "was the output actually good."
 */
export async function reviewGate<T>(opts: ReviewGateOptions<T>): Promise<T> {
  let feedback: string | null = null;

  for (let attemptNumber = 1; attemptNumber <= opts.maxAttempts; attemptNumber++) {
    const result = await opts.attempt(feedback, attemptNumber);
    const verdict = await opts.validate(result);

    await prisma.attempt.create({
      data: {
        jobId: opts.jobId,
        gateName: opts.gateName,
        subjectType: opts.subjectType,
        subjectId: opts.subjectId,
        attemptNumber,
        verdict: verdict.pass ? "PASS" : "FAIL",
        feedback: verdict.pass ? null : (verdict.feedback ?? "failed QA, no reason given"),
      },
    });

    if (verdict.pass) {
      return result;
    }
    feedback = verdict.feedback ?? "Output failed automated QA for an unspecified reason.";
  }

  throw new ReviewGateError(opts.gateName, opts.maxAttempts, feedback);
}

export class ReviewGateError extends Error {
  constructor(
    public readonly gateName: string,
    public readonly maxAttempts: number,
    public readonly lastFeedback: string | null,
  ) {
    super(`${gateName}: failed QA after ${maxAttempts} attempt(s)${lastFeedback ? ` — ${lastFeedback}` : ""}`);
    this.name = "ReviewGateError";
  }
}

/**
 * QA-exhaustion is a terminal business outcome, not a transient failure —
 * regenerating already tried `maxAttempts` times with feedback each round,
 * so letting BullMQ retry the whole outer job again would just repeat the
 * same failure at extra cost. Call this from inside the processor's own
 * catch block and return normally afterward so BullMQ sees the job as
 * "handled," not "crashed."
 */
export async function failJobFromQA(jobId: string, error: ReviewGateError): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "FAILED", latestError: error.message },
  });
}
