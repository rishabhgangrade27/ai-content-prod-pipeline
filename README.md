# AI Content Production Pipeline

A production-oriented pipeline that turns a creative brief into short-form ad/UGC-style video (9:16 + 16:9), with automated QA/retry gates and a human review step before delivery.

n8n is the real orchestrator (webhook/Slack triggers, branching, retries) — it calls out to a TypeScript backend for everything that needs durable state: job/scene/asset tracking, queued background work, FFmpeg rendering, and QA. An MCP server exposes the same pipeline as tools a Claude client can call directly.

## Architecture

```text
Slack / Web UI / MCP client (Claude Desktop)
                │
                ▼
        n8n (self-hosted, Docker)
                │  HTTP calls out to:
  ┌─────────────┼───────────────────┐
  ▼              ▼                  ▼
MCP Server    Node/TS API      BullMQ workers (Redis)
                │
                ▼
           PostgreSQL (+ pgvector, later)
                ▼
        Next.js review dashboard
                ▼
     Delivery: S3/MinIO, Slack, Google Drive
```

Full build plan and stage-by-stage roadmap: see the project's plan history. Current status:
- **Stage 0/1**: Postgres schema + a working job-creation/status API.
- **Stage 2**: provider abstraction — Claude Haiku 4.5 (script/scenes), fal.ai FLUX.1 [schnell] (images), Google Cloud TTS (voiceover), Freesound (CC0/CC-BY music) — swappable via env vars in `packages/providers`.
- **Stage 3**: `apps/worker` — real BullMQ queues (`script` → `scene-plan` → fan-out via `FlowProducer` into `image`/`tts`/`music` per scene → `render-prep` fan-in), each with its own retry/backoff policy, a durable `attempts` table logging every try (pass or fail), per-call `cost_events`, and object storage (`packages/storage`, MinIO locally / S3 in prod) for generated audio. Verified live end-to-end: a job with no API keys configured retries 3× with real exponential backoff, logs each failure, then correctly flips to `FAILED`.

- **Stage 4**: FFmpeg render module (`apps/worker/src/render`) — per-scene Ken Burns motion + burned-in captions + narration audio, concatenated, background music mixed in, output at 9:16 and/or 16:9. For `format: "BOTH"`, the 16:9 variant is derived from the same source image via a blurred-background pad rather than a second image-generation call. Verified end-to-end with synthetic fixtures (`npx tsx src/render/smoke-test.ts` in `apps/worker`) — real ffprobe-confirmed output (correct resolution, codecs, duration) and visually inspected frames, not just "the job didn't crash."
- **Stage 5**: `apps/worker/src/qa` — a `review_gate()` retry-with-feedback loop wired into all four generation stages (script, image, TTS, final render). This is deliberately a *second*, distinct retry axis from Stage 3's BullMQ transport retries: BullMQ retries when the API call itself throws (network/auth errors); `review_gate()` retries when the call succeeds but the *output* fails QA (empty script, an NSFW-flagged image, a truncated audio clip, a render with the wrong resolution/duration) — regenerating with the validator's own feedback each time, not blindly repeating. Every attempt, pass or fail, is a durable row in `attempts` under its own gate name (`script_qa`, `image_qa`, `tts_qa`, `render_qa`) so it stays distinguishable from the Stage 3 transport-retry rows. Exhausting a gate flips the job straight to `FAILED` rather than triggering another outer BullMQ retry of an already-exhausted regeneration loop. On a full pass, `render_qa` is what actually advances a job from `RENDERING`/`QA` to `REVIEW` — human review only ever sees output that already passed automated QA. Verified with a dedicated mechanics smoke test (`npx tsx src/qa/smoke-test.ts`: proves feedback threading, pass-after-failures, and exhaustion) plus the full Stage 4 fixture re-run, which now correctly lands at `REVIEW` after both variants pass `render_qa`.

- **Stage 6**: `apps/mcp-server` — a real MCP server (`@modelcontextprotocol/server` v2) exposing six tools (`create_job`, `get_job_status`, `list_pending_reviews`, `approve_review`, `reject_review`, `trigger_regeneration`) that a Claude client can call directly. Deliberately built as a thin API client, not a reimplementation — it calls `apps/api`'s own REST endpoints (including two new ones added for this stage: `POST /jobs/:id/review` and `POST /jobs/:id/regenerate`) rather than touching Postgres itself, so the MCP server, the REST API, and any future n8n workflow all go through the same business logic and validation. Verified with a real MCP client over stdio (`npx tsx src/smoke-test.ts` in `apps/mcp-server`) driving the full lifecycle against the live API and database — including the background worker picking up a regenerated job mid-test, and a deliberate error case (approving a job that isn't awaiting review) correctly surfacing as `isError: true` with the real API's message.

Everything past that (n8n workflow, dashboard) is scaffolded in the repo layout but not yet implemented.

### Connecting to Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-content-production-pipeline": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/apps/mcp-server/src/index.ts"]
    }
  }
}
```

Requires `apps/api` (and Postgres/Redis) running separately — the MCP server is a client of that API, not a replacement for it.

### Local prerequisites

FFmpeg must be on `PATH` (the worker shells out to `ffmpeg`/`ffprobe` directly). On Windows: `winget install Gyan.FFmpeg`. `CAPTION_FONT_FILE` (optional) overrides the caption font — defaults to a Windows system font, override for Linux deployment.

### Provider choices and why

| Component | Provider | Why |
|---|---|---|
| Script + scene breakdown | Claude Haiku 4.5 (`@anthropic-ai/sdk`, `messages.parse` + Zod) | Cheap, strict structured JSON output, no separate training-data concern (Anthropic API does not train on API data by default) |
| Scene images | fal.ai FLUX.1 [schnell] | ~$0.003/megapixel, real async queue API |
| Voiceover | Google Cloud TTS | 4M free characters/month for standard voices |
| Background music | Freesound (CC0/CC-BY only, via `filter`) | Free, real REST API, commercial-safe by license filter |
| Motion | FFmpeg Ken Burns/zoompan from stills (Stage 4, not yet built) | Deterministic, zero API cost; true video-gen stays a swappable future provider |

**Not yet verified:** fal.ai's and Freesound's data-retention/training terms weren't checked before wiring these adapters (Anthropic's and Google Cloud's enterprise data policies are well-established and don't train on API data by default). Only synthetic/demo briefs should go through this pipeline until that's confirmed — see the org's data-security guidance if this ever handles real client content.

To try a provider once you've added its key to `.env`:

```bash
cd packages/providers
npx tsx src/smoke-test.ts llm     # or: image | tts | music
```

## Repo layout

```text
apps/
  api/            Express + TS + Zod + Prisma — REST API, job state machine
  worker/         (planned) BullMQ workers
  dashboard/      (planned) Next.js review UI
  mcp-server/     MCP server exposing job/review tools to Claude clients
packages/
  db/             Prisma schema + generated client
  providers/      LLM/image/TTS/music provider abstraction (Claude, fal.ai, Google TTS, Freesound)
n8n/
  workflows/      (planned) exported n8n workflow JSON
docker-compose.yml
```

## Prerequisites

- Node.js 20+, npm 10+
- Docker Desktop

## Setup

1. Copy the env file and adjust if anything on your machine conflicts with the defaults:

   ```bash
   cp .env.example .env
   ```

   > If Postgres auth fails with the default port 5432, something else on your machine (security software, a leftover local Postgres install) may be intercepting that port. This repo maps Postgres to host port **55432** by default specifically to avoid that.

2. Start infrastructure:

   ```bash
   docker compose up -d postgres redis
   ```

3. Install dependencies (from repo root — this is an npm workspaces monorepo):

   ```bash
   npm install
   ```

4. Generate the Prisma client and run migrations:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

5. Start the API:

   ```bash
   npm run dev:api
   ```

## Verify it's working

```bash
curl http://localhost:3001/health

curl -X POST http://localhost:3001/jobs \
  -H "Content-Type: application/json" \
  -d '{"brief":"15s vertical UGC ad for a reusable water bottle","format":"VERTICAL"}'

curl http://localhost:3001/jobs
```

Inspect data directly with `npm run prisma:studio`.

## Status

This project is in active development, built to demonstrate n8n orchestration, MCP server development, TypeScript backend/API design, Postgres data modeling, and AI-workflow automation. Deployment and public GitHub publication are deliberately deferred until the core pipeline is built and verified locally.
