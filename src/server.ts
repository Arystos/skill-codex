import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOL_NAME, TOOL_DESCRIPTION, inputSchema, handleCodexExec } from "./tools/codex-exec.js";

export function createServer(cwd: string): Server {
  const server = new Server(
    { name: "codex-bridge", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        inputSchema: {
          type: "object" as const,
          properties: {
            prompt: { type: "string", description: "The task description for Codex" },
            mode: {
              type: "string",
              enum: ["exec", "full-auto"],
              default: "exec",
              description: "exec = read-only, full-auto = can write files",
            },
            cwd: { type: "string", description: "Working directory (defaults to server cwd)" },
            timeoutMs: { type: "number", description: "Override default timeout in milliseconds" },
            requireGit: {
              type: "boolean",
              default: false,
              description: "Fail if not inside a git repository",
            },
          },
          required: ["prompt"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== TOOL_NAME) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    const parsed = inputSchema.safeParse(request.params.arguments);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    return handleCodexExec(parsed.data, cwd);
  });

  return server;
}

export async function startServer(): Promise<void> {
  const cwd = process.cwd();
  const server = createServer(cwd);
  const transport = new StdioServerTransport();

  process.stderr.write("[codex-bridge] MCP server starting...\n");

  await server.connect(transport);

  process.stderr.write("[codex-bridge] MCP server connected via stdio\n");

  process.on("uncaughtException", (err) => {
    process.stderr.write(`[codex-bridge] Uncaught exception: ${err.message}\n`);
  });

  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`[codex-bridge] Unhandled rejection: ${String(reason)}\n`);
  });
}
