# AI Content Production Pipeline

A production-oriented pipeline that turns a creative brief into short-form ad/UGC-style video (9:16 + 16:9), with automated QA/retry gates and a human review step before delivery.

n8n is the real orchestrator (webhook/Slack triggers, branching, retries), it calls out to a TypeScript backend for everything that needs durable state: job/scene/asset tracking, queued background work, FFmpeg rendering, and QA. An MCP server exposes the same pipeline as tools a Claude client can call directly.

## Architecture

```text
Slack ──────────┐
                 │ (webhook trigger + interactivity)
                 ▼
        n8n (self-hosted, Docker)
                 │
                 ▼
Claude Desktop ──────────►  Node/TS API (apps/api)  ◄────────── Next.js dashboard
  (MCP Server)                     │                            (apps/dashboard)
                                    ▼
                          BullMQ workers (Redis)
                        script → scene-plan → image/tts/music
                              → render-prep → render (FFmpeg)
                                    │
                                    ▼
                    PostgreSQL  +  MinIO/S3 (assets, final renders)
                                    │
                                    ▼
                  Delivery: Slack notification, Google Drive (planned)
```

Everything, n8n, the MCP server, the dashboard, is a client of the same `apps/api`. None of them talk to Postgres or the queue directly; that's deliberate, so business logic and validation live in exactly one place.

Full build plan and stage-by-stage roadmap: see the project's plan history. Current status:
- **Stage 0/1**: Postgres schema + a working job-creation/status API.
- **Stage 2**: provider abstraction, Claude Haiku 4.5 (script/scenes), fal.ai FLUX.1 [schnell] (images), Google Cloud TTS (voiceover), Freesound (CC0/CC-BY music), swappable via env vars in `packages/providers`.
- **Stage 3**: `apps/worker`, real BullMQ queues (`script` → `scene-plan` → fan-out via `FlowProducer` into `image`/`tts`/`music` per scene → `render-prep` fan-in), each with its own retry/backoff policy, a durable `attempts` table logging every try (pass or fail), per-call `cost_events`, and object storage (`packages/storage`, MinIO locally / S3 in prod) for generated audio. Verified live end-to-end: a job with no API keys configured retries 3× with real exponential backoff, logs each failure, then correctly flips to `FAILED`.

- **Stage 4**: FFmpeg render module (`apps/worker/src/render`), per-scene Ken Burns motion + burned-in captions + narration audio, concatenated, background music mixed in, output at 9:16 and/or 16:9. For `format: "BOTH"`, the 16:9 variant is derived from the same source image via a blurred-background pad rather than a second image-generation call. Verified end-to-end with synthetic fixtures (`npx tsx src/render/smoke-test.ts` in `apps/worker`), real ffprobe-confirmed output (correct resolution, codecs, duration) and visually inspected frames, not just "the job didn't crash."
- **Stage 5**: `apps/worker/src/qa`, a `review_gate()` retry-with-feedback loop wired into all four generation stages (script, image, TTS, final render). This is deliberately a *second*, distinct retry axis from Stage 3's BullMQ transport retries: BullMQ retries when the API call itself throws (network/auth errors); `review_gate()` retries when the call succeeds but the *output* fails QA (empty script, an NSFW-flagged image, a truncated audio clip, a render with the wrong resolution/duration), regenerating with the validator's own feedback each time, not blindly repeating. Every attempt, pass or fail, is a durable row in `attempts` under its own gate name (`script_qa`, `image_qa`, `tts_qa`, `render_qa`) so it stays distinguishable from the Stage 3 transport-retry rows. Exhausting a gate flips the job straight to `FAILED` rather than triggering another outer BullMQ retry of an already-exhausted regeneration loop. On a full pass, `render_qa` is what actually advances a job from `RENDERING`/`QA` to `REVIEW`, human review only ever sees output that already passed automated QA. Verified with a dedicated mechanics smoke test (`npx tsx src/qa/smoke-test.ts`: proves feedback threading, pass-after-failures, and exhaustion) plus the full Stage 4 fixture re-run, which now correctly lands at `REVIEW` after both variants pass `render_qa`.

- **Stage 6**: `apps/mcp-server`, a real MCP server (`@modelcontextprotocol/server` v2) exposing six tools (`create_job`, `get_job_status`, `list_pending_reviews`, `approve_review`, `reject_review`, `trigger_regeneration`) that a Claude client can call directly. Deliberately built as a thin API client, not a reimplementation, it calls `apps/api`'s own REST endpoints (including two new ones added for this stage: `POST /jobs/:id/review` and `POST /jobs/:id/regenerate`) rather than touching Postgres itself, so the MCP server, the REST API, and any future n8n workflow all go through the same business logic and validation. Verified with a real MCP client over stdio (`npx tsx src/smoke-test.ts` in `apps/mcp-server`) driving the full lifecycle against the live API and database, including the background worker picking up a regenerated job mid-test, and a deliberate error case (approving a job that isn't awaiting review) correctly surfacing as `isError: true` with the real API's message.

- **Stage 7**: `n8n/workflows`, three n8n workflows making n8n the real front door, not a toy demo: **Main** (webhook trigger → creates a job via the API → acks immediately → bounded polling loop, max 40 tries, with real branching on `REVIEW`/`FAILED`/timeout, not a blind fixed wait), **Slack Actions** (a dedicated interactivity callback webhook, approve/reject buttons in the Slack message post back here, which calls the API's review endpoint and updates the original message), and **Error Handler** (an `errorTrigger`-based workflow, wired as both other workflows' `settings.errorWorkflow`, so any node failure anywhere gets reported to Slack automatically). Deliberately does **not** use n8n's built-in Slack "Send and Wait for Response" node, it has open bug reports about looping instead of resuming on exactly this kind of approve/reject flow, so the interactivity is hand-built with a second webhook instead, which is also a better demonstration of real n8n engineering than dropping in a canned node.

<img width="1919" height="815" alt="image" src="https://github.com/user-attachments/assets/32ead038-a247-4d2c-8c84-d6f986d242d0" />


  **Honest limitation:** this n8n instance already had an owner account set up from earlier work outside this session, and I didn't have those credentials, so unlike every other stage, this one is **not verified against a live n8n import**. The workflow JSON is syntax-valid and the node graph/expressions were hand-built as carefully as Stages 1-6's actual running code, but n8n's exact node parameter schemas (particularly the `if` node's filter shape) weren't confirmed against a live editor. Expect to need a short pass in the n8n UI after import, normal for hand-authored workflow JSON, not a sign anything is fundamentally wrong.

- **Stage 8**: `apps/dashboard`, Next.js 16 (App Router) + Tailwind + shadcn/ui review dashboard: a job list with status filters, a job detail view (script, scenes with their image/audio, final render players, QA/attempt history, per-stage cost breakdown), a new-job form, and Approve/Reject/Regenerate actions, all calling `apps/api` the same way the MCP server and n8n do. Also verified with real browser automation (Playwright), not just a type-check.

  **A real bug this caught, worth calling out on its own:** the initial Approve/Reject implementation put two submit buttons in one form, each carrying a different `name`/`value` pair (`decision=APPROVED` vs `decision=REJECTED`) to a shared Server Action, a completely standard HTML pattern. Live testing showed a hydration-mismatch warning revealing that Next.js's Server Actions runtime *itself* rewrites a submitter button's `name` attribute to its own internal `$ACTION_ID_...` dispatch key, silently discarding the `name="decision"` I'd set. Both buttons were submitting with no usable decision field, and the reviews were failing with a 500, invisible from a type-check or a glance at the code, only found by actually clicking the buttons and watching the real backend state. Fixed with Next's documented pattern for this exact case: `reviewAction.bind(null, "APPROVED")` / `.bind(null, "REJECTED")` as each button's own `formAction`, binding the decision into the action itself instead of fighting the framework for the button's `name`.

  Also worth noting: this generation of `shadcn/ui` has moved off Radix onto `@base-ui/react`, with a different polymorphic-prop API (`render` instead of `asChild`), caught by reading the actual generated component source before using it, not assumed from prior shadcn/Radix experience. Three of the CLI's own installs (`@base-ui/react`, `tw-animate-css`, and the `shadcn` package itself, imported from `globals.css`) silently failed to actually land in `package.json`/`node_modules` despite the CLI reporting success, same install-verification issue hit repeatedly with `npm install -w` earlier in this project, just via a different tool this time. Installed explicitly and confirmed resolvable before trusting it.

Every stage in the build plan is now implemented.

### Setting up the n8n workflows

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) with:
   - Bot token scope `chat:write` → install to workspace → copy the `xoxb-...` bot token into `SLACK_BOT_TOKEN` in `.env`.
   - **Interactivity & Shortcuts** enabled, Request URL set to `http://<your-n8n-host>:5678/webhook/slack-actions` (needs to be reachable from Slack, use a tunnel like `ngrok` for local dev, since Slack can't reach `localhost`).
   - Set `SLACK_CHANNEL_ID` to the channel the bot should post to (invite the bot to that channel first).
2. `docker compose up -d n8n` (already wired with `API_BASE_URL`/`SLACK_BOT_TOKEN`/`SLACK_CHANNEL_ID` from `.env`).
3. In the n8n UI (`http://localhost:5678`): **Workflows → Import from File** for each of `n8n/workflows/01-content-pipeline.json`, `02-slack-actions.json`, `03-error-handler.json` (import the error handler first, the other two reference its workflow id).
4. Open each imported workflow and publish/activate it (n8n 2.x uses a publish model, not the old active toggle, check for a "Publish" action if "Active" isn't present).
5. Test the entry point without needing Slack at all:
   ```bash
   curl -X POST http://localhost:5678/webhook/create-job \
     -H "Content-Type: application/json" \
     -d '{"brief":"15s vertical UGC ad for a reusable water bottle","format":"VERTICAL"}'
   ```
   This should return immediately with a `jobId`, and the workflow keeps polling in the background, check `apps/api`'s job status endpoint or the n8n execution log to confirm it's progressing.

### Running the dashboard

```bash
npm run dev -w apps/dashboard
```

Needs `apps/api` running (it's a client of the same API everything else uses). Opens on `http://localhost:3000`, `/` for the job list, `/new` to create a job, `/jobs/:id` for the detail/review view.

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

Requires `apps/api` (and Postgres/Redis) running separately, the MCP server is a client of that API, not a replacement for it.

### Local prerequisites

FFmpeg must be on `PATH` (the worker shells out to `ffmpeg`/`ffprobe` directly). On Windows: `winget install Gyan.FFmpeg`. `CAPTION_FONT_FILE` (optional) overrides the caption font, defaults to a Windows system font, override for Linux deployment.

### Provider choices and why

| Component | Provider | Why |
|---|---|---|
| Script + scene breakdown | Claude Haiku 4.5 (`@anthropic-ai/sdk`, `messages.parse` + Zod) | Cheap, strict structured JSON output, no separate training-data concern (Anthropic API does not train on API data by default) |
| Scene images | fal.ai FLUX.1 [schnell] | ~$0.003/megapixel, real async queue API |
| Voiceover | Google Cloud TTS | 4M free characters/month for standard voices |
| Background music | Freesound (CC0/CC-BY only, via `filter`) | Free, real REST API, commercial-safe by license filter |
| Motion | FFmpeg Ken Burns/zoompan from stills (Stage 4, not yet built) | Deterministic, zero API cost; true video-gen stays a swappable future provider |

**Not yet verified:** fal.ai's and Freesound's data-retention/training terms weren't checked before wiring these adapters (Anthropic's and Google Cloud's enterprise data policies are well-established and don't train on API data by default). Only synthetic/demo briefs should go through this pipeline until that's confirmed, see the org's data-security guidance if this ever handles real client content.

To try a provider once you've added its key to `.env`:

```bash
cd packages/providers
npx tsx src/smoke-test.ts llm     # or: image | tts | music
```

## Repo layout

```text
apps/
  api/            Express + TS + Zod + Prisma, REST API, job state machine
  worker/         (planned) BullMQ workers
  dashboard/      Next.js review UI, job list, detail view, approve/reject/regenerate
  mcp-server/     MCP server exposing job/review tools to Claude clients
packages/
  db/             Prisma schema + generated client
  providers/      LLM/image/TTS/music provider abstraction (Claude, fal.ai, Google TTS, Freesound)
n8n/
  workflows/      Main pipeline, Slack interactivity callback, error handler
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

3. Install dependencies (from repo root, this is an npm workspaces monorepo):

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
