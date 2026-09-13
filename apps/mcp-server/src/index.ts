import "./env.js";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { registerTools } from "./tools.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "ai-content-production-pipeline", version: "0.1.0" });
  registerTools(server);
  return server;
}

void serveStdio(createServer);
console.error("AI Content Production Pipeline MCP server running on stdio");
