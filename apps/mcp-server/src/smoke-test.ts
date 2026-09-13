/**
 * Manual smoke test: spawns the actual MCP server over stdio (as a real MCP
 * client would) and drives it through the whole review lifecycle against
 * the live API. Needs apps/api running (and Postgres/Redis up) — no AI
 * provider keys required, since this never touches the generation pipeline
 * directly, only the job/review API surface the MCP tools wrap.
 *
 * Run: npx tsx src/smoke-test.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function main() {
  const client = new Client({ name: "smoke-test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "src/index.ts"] });
  await client.connect(transport);

  try {
    const { tools } = await client.listTools();
    console.log(`Discovered ${tools.length} tools:`);
    for (const tool of tools) console.log(` - ${tool.name}: ${tool.description}`);

    console.log("\n--- create_job ---");
    const created = await client.callTool({
      name: "create_job",
      arguments: { brief: "[mcp smoke test] 15s ad for a reusable water bottle", format: "VERTICAL" },
    });
    console.log(textOf(created as any));
    const jobId = /Job (\S+) —/.exec(textOf(created as any))?.[1];
    if (!jobId) throw new Error("could not extract jobId from create_job result");

    console.log("\n--- get_job_status ---");
    const status = await client.callTool({ name: "get_job_status", arguments: { jobId } });
    console.log(textOf(status as any));

    console.log("\n--- list_pending_reviews (before) ---");
    console.log(textOf((await client.callTool({ name: "list_pending_reviews", arguments: {} })) as any));

    // This job won't organically reach REVIEW without real provider keys, so
    // force it there directly to exercise the review/regenerate tools too.
    const { prisma } = await import("@pipeline/db");
    await prisma.job.update({ where: { id: jobId }, data: { status: "REVIEW" } });
    await prisma.$disconnect();

    console.log("\n--- list_pending_reviews (after forcing REVIEW) ---");
    console.log(textOf((await client.callTool({ name: "list_pending_reviews", arguments: {} })) as any));

    console.log("\n--- reject_review ---");
    console.log(
      textOf(
        (await client.callTool({
          name: "reject_review",
          arguments: { jobId, reviewer: "smoke-test", comment: "test rejection" },
        })) as any,
      ),
    );

    console.log("\n--- trigger_regeneration ---");
    console.log(textOf((await client.callTool({ name: "trigger_regeneration", arguments: { jobId } })) as any));

    console.log("\n--- get_job_status (after regenerate) ---");
    console.log(textOf((await client.callTool({ name: "get_job_status", arguments: { jobId } })) as any));

    console.log("\n--- error path: approve a QUEUED job (should fail) ---");
    const errResult = (await client.callTool({
      name: "approve_review",
      arguments: { jobId, reviewer: "smoke-test" },
    })) as any;
    console.log("isError:", errResult.isError, "|", textOf(errResult));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
