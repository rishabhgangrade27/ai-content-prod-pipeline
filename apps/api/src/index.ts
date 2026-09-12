import "./env.js";

import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./logger.js";
import { jobsRouter } from "./routes/jobs.js";

const app = express();

app.use(express.json());
app.use(pinoHttp({ logger }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/jobs", jobsRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error(err);
  res.status(500).json({ error: "internal server error" });
});

const port = Number(process.env.API_PORT ?? 3001);

app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});
