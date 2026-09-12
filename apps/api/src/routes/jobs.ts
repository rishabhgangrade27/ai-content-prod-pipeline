import { Router } from "express";
import { z } from "zod";
import { prisma, JobFormat } from "@pipeline/db";
import { scriptQueue, SCRIPT_RETRY_OPTS } from "../queue.js";

export const jobsRouter = Router();

const createJobSchema = z.object({
  brief: z.string().min(1, "brief is required"),
  format: z.enum(JobFormat).default("VERTICAL"),
  deliveryTarget: z.string().optional(),
  webhookUrl: z.url().optional(),
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

jobsRouter.get("/", async (_req, res, next) => {
  try {
    const jobs = await prisma.job.findMany({ orderBy: { createdAt: "desc" } });
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
