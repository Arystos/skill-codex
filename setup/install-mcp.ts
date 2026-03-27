import fs from "node:fs";
import path from "node:path";
import { getGlobalMcpConfigPath } from "../src/config/paths.js";
import { getPackageRoot } from "../src/config/package-root.js";

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function getServerEntryPath(): string {
  return path.join(getPackageRoot(), "dist", "index.js");
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
  if ("skill-codex" in servers && !options.force) {
    return {
      installed: false,
      configPath,
      message: "skill-codex MCP server already registered. Use --force to overwrite.",
    };
  }

  const entryPath = getServerEntryPath();

  // Create new config with merged MCP server
  const updatedConfig: McpConfig = {
    ...config,
    mcpServers: {
      ...servers,
      "skill-codex": {
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
