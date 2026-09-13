import { Router } from "express";
import { z } from "zod";
import { prisma, JobFormat, JobStatus } from "@pipeline/db";
import { scriptQueue, SCRIPT_RETRY_OPTS } from "../queue.js";

export const jobsRouter = Router();

const createJobSchema = z.object({
  brief: z.string().min(1, "brief is required"),
  format: z.enum(JobFormat).default("VERTICAL"),
  deliveryTarget: z.string().optional(),
  webhookUrl: z.url().optional(),
});

const reviewDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewer: z.string().min(1, "reviewer is required"),
  comment: z.string().optional(),
});

jobsRouter.post("/", async (req, res, next) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const job = await prisma.job.create({ data: parsed.data });
    await scriptQueue.add("generate", { jobId: job.id }, SCRIPT_RETRY_OPTS);
    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

const listJobsQuerySchema = z.object({
  status: z.enum(JobStatus).optional(),
});

jobsRouter.get("/", async (req, res, next) => {
  const parsed = listJobsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const jobs = await prisma.job.findMany({
      where: parsed.data.status ? { status: parsed.data.status } : undefined,
      orderBy: { createdAt: "desc" },
    });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { scenes: true, assets: true, attempts: true, reviews: true },
    });
    if (!job) {
      return res.status(404).json({ error: "job not found" });
    }
    res.json(job);
  } catch (err) {
    next(err);
  }
});

jobsRouter.post("/:id/review", async (req, res, next) => {
  const parsed = reviewDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) {
      return res.status(404).json({ error: "job not found" });
    }
    if (job.status !== "REVIEW") {
      return res.status(409).json({ error: `job is in status ${job.status}, not awaiting review` });
    }

    const { decision, reviewer, comment } = parsed.data;
    const [review, updatedJob] = await prisma.$transaction([
      prisma.review.create({ data: { jobId: job.id, reviewer, decision, comment } }),
      prisma.job.update({ where: { id: job.id }, data: { status: decision } }),
    ]);

    res.json({ review, job: updatedJob });
  } catch (err) {
    next(err);
  }
});

jobsRouter.post("/:id/regenerate", async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) {
      return res.status(404).json({ error: "job not found" });
    }
    if (job.status !== "REJECTED" && job.status !== "FAILED") {
      return res.status(409).json({ error: `job is in status ${job.status} — only REJECTED or FAILED jobs can be regenerated` });
    }

    await prisma.$transaction([
      prisma.attempt.deleteMany({ where: { jobId: job.id } }),
      prisma.asset.deleteMany({ where: { jobId: job.id } }),
      prisma.scene.deleteMany({ where: { jobId: job.id } }),
      prisma.review.deleteMany({ where: { jobId: job.id } }),
      prisma.job.update({
        where: { id: job.id },
        data: { status: "QUEUED", script: null, latestError: null },
      }),
    ]);

    await scriptQueue.add("generate", { jobId: job.id }, SCRIPT_RETRY_OPTS);

    const refreshed = await prisma.job.findUnique({ where: { id: job.id } });
    res.json(refreshed);
  } catch (err) {
    next(err);
  }
});
