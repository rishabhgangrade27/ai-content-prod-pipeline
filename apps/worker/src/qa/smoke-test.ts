/**
 * Manual smoke test for the review_gate() mechanics themselves — no ffmpeg,
 * no AI providers, just proves: retry-with-feedback threading, durable
 * Attempt logging (pass and fail), and correct exhaustion behavior.
 * Run: npx tsx src/qa/smoke-test.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const { prisma } = await import("@pipeline/db");
const { reviewGate, ReviewGateError } = await import("./review-gate.js");

const job = await prisma.job.create({
  data: { brief: "[qa smoke test]", status: "GENERATING" },
});
console.log("created test job:", job.id);

// Case 1: fails twice, then passes on the 3rd attempt — proves feedback
// threads from validate() into the next attempt() call, and that a PASS
// after failures still resolves normally.
let seenFeedback: (string | null)[] = [];
const result = await reviewGate<{ n: number }>({
  jobId: job.id,
  gateName: "smoke_test_pass_eventually",
  subjectType: "job",
  subjectId: job.id,
  maxAttempts: 3,
  attempt: async (feedback, attemptNumber) => {
    seenFeedback.push(feedback);
    return { n: attemptNumber };
  },
  validate: async (candidate) =>
    candidate.n < 3 ? { pass: false, feedback: `attempt ${candidate.n} was too small` } : { pass: true },
});
console.log("case 1 (pass on 3rd attempt): result =", result, "| feedback seen by each attempt =", seenFeedback);

// Case 2: always fails — proves ReviewGateError is thrown with the right
// shape once maxAttempts is exhausted, and every attempt still gets logged.
let case2Error: unknown;
try {
  await reviewGate<{ ok: boolean }>({
    jobId: job.id,
    gateName: "smoke_test_always_fails",
    subjectType: "job",
    subjectId: job.id,
    maxAttempts: 2,
    attempt: async () => ({ ok: false }),
    validate: async () => ({ pass: false, feedback: "deliberately always fails" }),
  });
} catch (err) {
  case2Error = err;
}
console.log(
  "case 2 (exhausts retries): threw ReviewGateError =",
  case2Error instanceof ReviewGateError,
  "| message =",
  case2Error instanceof Error ? case2Error.message : case2Error,
);

const attempts = await prisma.attempt.findMany({ where: { jobId: job.id }, orderBy: [{ gateName: "asc" }, { attemptNumber: "asc" }] });
console.log(`\nattempts table has ${attempts.length} rows for this job:`);
for (const a of attempts) {
  console.log(` ${a.gateName} #${a.attemptNumber} ${a.verdict} ${a.feedback ? "— " + a.feedback : ""}`);
}

await prisma.$disconnect();
