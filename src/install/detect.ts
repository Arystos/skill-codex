import fs from "node:fs";
import path from "node:path";
import { getGlobalMcpConfigPath } from "../config/paths.js";
import { getClaudeDir, normalizePath } from "../util/platform.js";

const SERVER_NAME = "skill-codex";

/** How skill-codex is wired into Claude Code on this machine. */
export interface InstallState {
  /** Registered by `skill-codex setup` in ~/.claude.json (mcpServers). */
  readonly setupServer: { readonly command: string; readonly args: readonly string[] } | null;
  /** Installed as a Claude Code plugin (keys like "skill-codex@<marketplace>"). */
  readonly pluginIds: readonly string[];
  /** Projects whose ~/.claude.json entry disables the skill-codex MCP server. */
  readonly disabledInProjects: readonly string[];
  /** Project-level registrations for the inspected directory: "local" (~/.claude.json) and/or "project" (.mcp.json). */
  readonly projectScopes: readonly ("local" | "project")[];
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readSetupServer(claudeJson: Record<string, unknown>): InstallState["setupServer"] {
  const entry = asRecord(asRecord(claudeJson.mcpServers)[SERVER_NAME]);
  if (Object.keys(entry).length === 0) return null;
  const args = Array.isArray(entry.args) ? entry.args.filter((a): a is string => typeof a === "string") : [];
  return { command: typeof entry.command === "string" ? entry.command : "", args };
}

function readDisabledProjects(claudeJson: Record<string, unknown>): string[] {
  return Object.entries(asRecord(claudeJson.projects))
    .filter(([, project]) => {
      const disabled = asRecord(project).disabledMcpServers;
      return Array.isArray(disabled) && disabled.includes(SERVER_NAME);
    })
    .map(([projectPath]) => projectPath);
}

function hasServer(config: Record<string, unknown> | null): boolean {
  return Object.keys(asRecord(asRecord(config?.mcpServers)[SERVER_NAME])).length > 0;
}

function findProjectEntry(claudeJson: Record<string, unknown>, cwd: string): Record<string, unknown> | null {
  const target = normalizeForCompare(cwd);
  const match = Object.entries(asRecord(claudeJson.projects)).find(([p]) => normalizeForCompare(p) === target);
  return match ? asRecord(match[1]) : null;
}

function readProjectScopes(claudeJson: Record<string, unknown>, cwd: string): ("local" | "project")[] {
  const scopes: ("local" | "project")[] = [];
  if (hasServer(findProjectEntry(claudeJson, cwd))) scopes.push("local");
  if (hasServer(readJson(path.join(cwd, ".mcp.json")))) scopes.push("project");
  return scopes;
}

function readPluginIds(pluginsFile: string): string[] {
  const plugins = asRecord(readJson(pluginsFile)?.plugins);
  return Object.keys(plugins).filter((id) => id.startsWith(`${SERVER_NAME}@`));
}

export function detectInstall(
  claudeJsonPath: string = getGlobalMcpConfigPath(),
  pluginsFile: string = path.join(getClaudeDir(), "plugins", "installed_plugins.json"),
  cwd: string = process.cwd(),
): InstallState {
  const claudeJson = readJson(claudeJsonPath) ?? {};
  return {
    setupServer: readSetupServer(claudeJson),
    pluginIds: readPluginIds(pluginsFile),
    disabledInProjects: readDisabledProjects(claudeJson),
    projectScopes: readProjectScopes(claudeJson, cwd),
  };
}

// Claude Code stores project paths with forward slashes; compare case-insensitively on Windows.
function normalizeForCompare(p: string): string {
  const n = normalizePath(path.resolve(p)).replace(/\/+$/, "");
  return process.platform === "win32" ? n.toLowerCase() : n;
}

/** Whether `cwd` is (inside) a project that disabled the server. */
export function isDisabledFor(state: InstallState, cwd: string): boolean {
  const target = normalizeForCompare(cwd);
  return state.disabledInProjects.some((p) => {
    const project = normalizeForCompare(p);
    return target === project || target.startsWith(`${project}/`);
  });
}
