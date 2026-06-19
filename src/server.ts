import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_INPUT_JSON_SCHEMA,
  inputSchema,
  handleCodexExec,
} from "./tools/codex-exec.js";

export function createServer(cwd: string): Server {
  const server = new Server(
    { name: "skill-codex", version: "0.8.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        inputSchema: TOOL_INPUT_JSON_SCHEMA,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
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

    // Stream live progress only if the client requested it (sent a progressToken).
    // MCP requires the `progress` value to monotonically increase per request.
    const progressToken = request.params._meta?.progressToken;
    let progressCounter = 0;
    const onProgress =
      progressToken === undefined
        ? undefined
        : (message: string): void => {
            progressCounter += 1;
            void extra
              .sendNotification({
                method: "notifications/progress",
                params: { progressToken, progress: progressCounter, message },
              })
              .catch(() => {
                // never let a dropped notification break the run
              });
          };

    return handleCodexExec(parsed.data, cwd, onProgress);
  });

  return server;
}

export async function startServer(): Promise<void> {
  const cwd = process.cwd();
  const server = createServer(cwd);
  const transport = new StdioServerTransport();

  process.stderr.write("[skill-codex] MCP server starting...\n");

  await server.connect(transport);

  process.stderr.write("[skill-codex] MCP server connected via stdio\n");

  process.on("uncaughtException", (err) => {
    process.stderr.write(`[skill-codex] Uncaught exception: ${err.message}\n`);
  });

  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`[skill-codex] Unhandled rejection: ${String(reason)}\n`);
  });
}
