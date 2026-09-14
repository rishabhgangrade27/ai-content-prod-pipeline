# AI Content Production Pipeline

A TypeScript/Node monorepo for turning a creative brief into short-form video (9:16 and 16:9), with asynchronous generation, deterministic FFmpeg rendering, automated QA, and human review.

**Public-repository status:** The core API, worker pipeline, fixture-based rendering/QA path, MCP API client, and dashboard are implemented. Provider adapters and n8n workflows are present, but this repository is not a public hosted service. The n8n workflow JSON has not been validated by importing and executing it in a live n8n instance. Google Drive delivery and pgvector/RAG are not implemented.

This is a portfolio implementation. Do not interpret the presence of provider adapters or workflow definitions as evidence of a continuously running production deployment.

## Architecture

```text
                         ┌─────────────────────┐
Slack / webhook ──► n8n ─►│                     │◄── Next.js dashboard
                         │      REST API       │
Claude client ──► MCP ──►│     (apps/api)      │
                         └──────────┬──────────┘
                                    │
                       ┌────────────┴────────────┐
                       ▼                         ▼
                PostgreSQL / Prisma          Redis / BullMQ
                jobs, scenes, assets,             │
                reviews, attempts, costs          ▼
                                         script → scene plan
                                         → image / TTS / music
                                         → render prep → FFmpeg
                                                    │
                                                    ▼
                                             MinIO / S3 assets
                                                    │
                                                    ▼
                                          automated QA → review
```

The API owns validation, workflow state, and business operations. The dashboard, MCP server, and n8n workflows are clients of that API; they should not independently mutate the database or queue.

## Implementation and verification status

| Area | Current status |
|---|---|
| REST API | Express + TypeScript + Zod routes for creating, listing, inspecting, reviewing, and regenerating jobs. |
| Persistence | PostgreSQL/Prisma models for jobs, scenes, assets, reviews, attempts, and cost events. |
| Background work | BullMQ workers for script, scene planning, image, TTS, music, render preparation, and rendering. |
| Providers | Adapters for Claude, fal.ai, Google Cloud TTS, and Freesound are present. Provider-backed output depends on valid credentials and provider availability. |
| Rendering | FFmpeg pipeline supports portrait/landscape output, captions, narration, and music. Fixture-based render smoke tests are available. |
| QA | Output-quality gates are separate from BullMQ transport retries; validator feedback is threaded into regeneration attempts and attempts are persisted. |
| MCP | A real MCP server exposes six job/review tools and calls the REST API. Its smoke test exercises the API lifecycle; it does not prove a complete provider-backed generation run. |
| Dashboard | Next.js review UI for jobs, scenes/assets, renders, QA/attempt history, costs, and review/regeneration actions. Browser testing was used to catch and fix a Server Actions issue. |
| n8n | Three workflow JSON files are authored for intake/polling, Slack review actions, and error handling. **Live import and execution are not verified.** |
| Delivery | Slack workflow definitions exist. Google Drive delivery is planned, not implemented. |
| Deployment | No public hosted deployment is provided. Run locally using the setup below. |
| RAG / vector memory | Not implemented; pgvector/RAG is out of scope for the current version. |

### Reliability design

There are two distinct retry mechanisms:

1. **BullMQ retries** handle execution/transport failures such as a provider request throwing.
2. **QA regeneration gates** handle successful calls that produce unacceptable output. The validator's feedback can be passed into another attempt, and attempts are recorded separately.

A job advances to human review only after the final-render QA gate passes. Human review remains an explicit approval boundary rather than being treated as an automatic consequence of generation.

## Repository layout

```text
apps/
  api/          Express + TypeScript + Zod REST API and job state machine
  worker/       BullMQ workers, QA, and FFmpeg rendering
  dashboard/    Next.js job/review interface
  mcp-server/   MCP tools backed by the REST API
packages/
  db/           Prisma schema and generated client
  providers/    LLM, image, TTS, and music provider adapters
  storage/      MinIO/S3-compatible asset storage
n8n/
  workflows/    Intake, Slack review actions, and error-handler JSON
```

## Local setup

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop / Docker Engine
- FFmpeg and ffprobe on `PATH` for rendering

### Start the API and infrastructure

From the repository root:

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev:api
```

The default Postgres host port is `55432` to avoid conflicts with a local Postgres installation. Adjust `.env` if needed.

Check the API:

```bash
curl http://localhost:3001/health
curl -X POST http://localhost:3001/jobs \
  -H "Content-Type: application/json" \
  -d '{"brief":"15s vertical UGC ad for a reusable water bottle","format":"VERTICAL"}'
curl http://localhost:3001/jobs
```

### Run the dashboard

With the API and required infrastructure running:

```bash
npm run dev -w apps/dashboard
```

Open `http://localhost:3000`. The job list is at `/`, creation at `/new`, and job details/review at `/jobs/:id`.

### Run smoke tests

The repository includes targeted smoke tests for provider adapters, rendering, QA mechanics, and the MCP/API lifecycle. Read each test's header for its prerequisites. Some require the API, database, Redis, FFmpeg, or provider credentials; fixture-based rendering and QA tests do not require live AI provider keys.

For example:

```bash
cd apps/worker
npx tsx src/render/smoke-test.ts
npx tsx src/qa/smoke-test.ts
```

The MCP smoke test is in `apps/mcp-server/src/smoke-test.ts` and requires the API plus Postgres/Redis. It deliberately moves a test job into review state to exercise review tools; it is not an end-to-end provider-generation test.

## n8n workflow setup (not yet live-verified)

The workflow files are hand-authored JSON and require validation in your own n8n instance before relying on them.

1. Start n8n using the repository's Docker Compose configuration.
2. Import `n8n/workflows/03-error-handler.json` first, then the intake and Slack action workflows.
3. Inspect node parameters and expressions in the editor, configure credentials/environment values, and publish the workflows.
4. Test the webhook and Slack interaction paths in a non-production workspace. Confirm success, timeout, rejection, and error-handler behavior in execution logs.

Do not treat these workflow files as verified until that import-and-execution pass has been completed.

## Connecting Claude Desktop

Add an MCP server entry to `claude_desktop_config.json` using the absolute path to `apps/mcp-server/src/index.ts`. The MCP server is a client of the running API; it does not replace the API, Postgres, or Redis.

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

## Provider and data-safety notes

Provider adapters are configured through environment variables. Before sending real client material, independently review the current data-retention, training, licensing, and commercial-use terms for each provider. Use synthetic/demo briefs until that review is complete. Never commit API keys, private client data, generated private assets, or populated local environment files.
