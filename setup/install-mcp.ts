import fs from "node:fs";
import path from "node:path";
import { getGlobalMcpConfigPath } from "../src/config/paths.js";

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function getServerEntryPath(): string {
  // Resolve the path to our dist/index.js
  const thisFile = new URL(import.meta.url).pathname;
  // On Windows, remove leading slash from /C:/...
  const normalized = process.platform === "win32" && thisFile.startsWith("/")
    ? thisFile.slice(1)
    : thisFile;
  return path.resolve(path.dirname(normalized), "..", "dist", "index.js");
}

export function installMcp(options: { force?: boolean } = {}): {
  installed: boolean;
  configPath: string;
  message: string;
} {
  const configPath = getGlobalMcpConfigPath();
  let config: McpConfig = {};

  // Read existing config
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      config = JSON.parse(raw) as McpConfig;
    } catch {
      return {
        installed: false,
        configPath,
        message: `Failed to parse ${configPath}. Back it up and try again.`,
      };
    }
  }

  // Check if already registered
  const servers = config.mcpServers ?? {};
  if ("codex-bridge" in servers && !options.force) {
    return {
      installed: false,
      configPath,
      message: "codex-bridge MCP server already registered. Use --force to overwrite.",
    };
  }

  const entryPath = getServerEntryPath();

  // Create new config with merged MCP server
  const updatedConfig: McpConfig = {
    ...config,
    mcpServers: {
      ...servers,
      "codex-bridge": {
        command: "node",
        args: [entryPath],
        env: {},
      },
    },
  };

  // Ensure directory exists
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write: write to temp file then rename to prevent corruption
  const tmpPath = configPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(updatedConfig, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, configPath);

  return {
    installed: true,
    configPath,
    message: `MCP server registered in ${configPath}`,
  };
}
