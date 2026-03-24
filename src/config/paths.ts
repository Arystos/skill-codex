import path from "node:path";
import { getClaudeDir, getHomeDir } from "../util/platform.js";

export function getClaudeSettingsPath(): string {
  return path.join(getClaudeDir(), "settings.json");
}

export function getGlobalMcpConfigPath(): string {
  return path.join(getHomeDir(), ".claude.json");
}

export function getGlobalCommandsDir(): string {
  return path.join(getClaudeDir(), "commands");
}

export function getProjectCommandsDir(cwd: string): string {
  return path.join(cwd, ".claude", "commands");
}

export function getProjectMcpConfigPath(cwd: string): string {
  return path.join(cwd, ".mcp.json");
}
