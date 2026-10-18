import fs from "node:fs";
import path from "node:path";
import { WINDOWS_SANDBOX_ENV } from "../config/constants.js";
import { formatBuildInfo, getBuildInfo, getVersion, type BuildInfo } from "../config/version.js";
import { VERIFIED_CODEX_VERSION } from "../config/codex-contract.js";
import { runCodexCommand, runCommand } from "../codex/cli.js";
import { listAvailableModels, readConfiguredModel } from "../codex/models.js";
import { codexVersionNotice, compareVersions, getInstalledCodexVersion, parseCodexVersion } from "../codex/version-check.js";
import { detectInstall, isDisabledFor, type InstallState } from "../install/detect.js";
import { extractTurnFailure } from "../runner/output-parser.js";
import { currentWindowsSandbox, getSandboxConfigArgs, type WindowsSandboxChoice } from "../runner/sandbox-args.js";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  readonly hint?: string;
}

const AUTH_PROBE_TIMEOUT_MS = 120_000;
const NPM_TIMEOUT_MS = 20_000;
const RECONNECT_HINT = "run `npm run build`, then in Claude Code: /mcp → skill-codex → Reconnect";

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const mtime = entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs;
    newest = Math.max(newest, mtime);
  }
  return newest;
}

/** Which build is running, and whether a dev checkout's dist is older than its source. */
export function checkBuild(info: BuildInfo = getBuildInfo()): CheckResult {
  if (!info.builtAt) return { name: "build", status: "warn", detail: formatBuildInfo(info), hint: "run `npm run build`" };
  const srcDir = path.join(info.root, "src");
  if (fs.existsSync(srcDir) && newestMtime(srcDir) > info.builtAt.getTime()) {
    return { name: "build", status: "warn", detail: `dist is older than src — ${formatBuildInfo(info)}`, hint: RECONNECT_HINT };
  }
  return { name: "build", status: "ok", detail: formatBuildInfo(info) };
}

export function checkNode(version: string = process.versions.node): CheckResult {
  const major = parseInt(version.split(".")[0] ?? "0", 10);
  return major >= 18
    ? { name: "node", status: "ok", detail: `v${version}` }
    : { name: "node", status: "fail", detail: `v${version}`, hint: "skill-codex needs Node.js 18 or newer" };
}

export async function checkCodex(): Promise<CheckResult> {
  const version = await getInstalledCodexVersion();
  if (!version) {
    return { name: "codex", status: "fail", detail: "codex CLI not found or not runnable", hint: "npm i -g @openai/codex" };
  }
  const notice = codexVersionNotice(version);
  return notice
    ? { name: "codex", status: "warn", detail: notice }
    : { name: "codex", status: "ok", detail: `codex-cli ${version} (verified ${VERIFIED_CODEX_VERSION})` };
}

export async function checkModels(): Promise<CheckResult> {
  const models = await listAvailableModels();
  const configured = readConfiguredModel();
  if (models.length === 0) {
    return { name: "models", status: "warn", detail: "could not read the account's model catalog (`codex debug models`)" };
  }
  const slugs = models.map((m) => m.slug);
  if (configured && !slugs.includes(configured)) {
    return {
      name: "models",
      status: "fail",
      detail: `config.toml model "${configured}" is not available on this account`,
      hint: `set \`model\` in ~/.codex/config.toml to one of: ${slugs.join(", ")}`,
    };
  }
  const defaultLabel = configured ? `default ${configured}` : "default: Codex's built-in";
  return { name: "models", status: "ok", detail: `${slugs.join(", ")} · ${defaultLabel}` };
}

/** A real, ephemeral, read-only Codex turn — `codex login status` reports "logged in" even with an expired token. */
export async function checkAuth(): Promise<CheckResult> {
  const args = ["exec", "--json", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", ...getSandboxConfigArgs(), "ping"];
  const result = await runCodexCommand(args, AUTH_PROBE_TIMEOUT_MS);
  if (result.stdout.includes('"type":"turn.completed"')) {
    return { name: "auth", status: "ok", detail: "a live Codex call with the default model succeeded" };
  }
  const failure = extractTurnFailure(result.stdout);
  if (failure?.status === 401 || failure?.status === 403 || /unauthori[sz]ed|401|token/i.test(failure?.message ?? "")) {
    return { name: "auth", status: "fail", detail: failure?.message ?? "unauthorized", hint: "run `codex logout`, then `codex login`" };
  }
  if (failure && /model/i.test(failure.message)) {
    return { name: "auth", status: "fail", detail: failure.message, hint: "fix the default model (see the models check)" };
  }
  const detail = failure?.message ?? (result.stderr.trim().split(/\r?\n/).pop() || "no response from Codex");
  return { name: "auth", status: "fail", detail };
}

export function checkSandbox(choice: WindowsSandboxChoice = currentWindowsSandbox()): CheckResult {
  if (process.platform !== "win32") {
    return { name: "sandbox", status: "skip", detail: "not Windows — Codex uses its native sandbox" };
  }
  const source = { env: WINDOWS_SANDBOX_ENV, config: "~/.codex/config.toml", default: "default" }[choice.source];
  const label = `windows.sandbox=${choice.mode} (${source})`;
  if (choice.invalidOverride) {
    return { name: "sandbox", status: "warn", detail: `${WINDOWS_SANDBOX_ENV}=${choice.invalidOverride} is not a valid mode; using ${label}` };
  }
  if (choice.mode === "unelevated") {
    return {
      name: "sandbox",
      status: "warn",
      detail: `${label} — Codex cannot start child processes, so it can't run builds or tests`,
      hint: 'set `[windows] sandbox = "elevated"` in ~/.codex/config.toml (Codex may ask for a one-time elevated setup)',
    };
  }
  if (choice.mode === "mxc") {
    return { name: "sandbox", status: "warn", detail: `${label} — git commands fail inside this sandbox`, hint: "use elevated instead" };
  }
  return { name: "sandbox", status: "ok", detail: `${label}; git trusts the workspace repo via safe.directory` };
}

function describeRegistration(state: InstallState): string {
  const parts = [
    state.setupServer ? `user scope (${[state.setupServer.command, ...state.setupServer.args.slice(0, 1)].join(" ")})` : null,
    state.pluginIds.length > 0 ? `plugin ${state.pluginIds.join(", ")}` : null,
    ...state.projectScopes.map((scope) => (scope === "project" ? "project .mcp.json" : "local scope")),
  ];
  return parts.filter((p): p is string => p !== null).join(" + ");
}

export function checkInstall(state: InstallState = detectInstall(), cwd: string = process.cwd(), root: string = getBuildInfo().root): CheckResult {
  const { setupServer, pluginIds, projectScopes } = state;
  if (!setupServer && pluginIds.length === 0 && projectScopes.length === 0) {
    return {
      name: "install",
      status: "fail",
      detail: "the skill-codex MCP server is not registered for this directory",
      hint:
        "run `npx skill-codex setup`, `/plugin install skill-codex@skill-codex`, or " +
        `\`claude mcp add --scope user skill-codex -- node ${path.join(root, "dist", "index.js")}\` (with Claude Code closed)`,
    };
  }
  if (setupServer && pluginIds.length > 0) {
    return {
      name: "install",
      status: "warn",
      detail: `installed twice (setup + plugin ${pluginIds.join(", ")}): the tool, commands and hook run twice`,
      hint: "keep one: `/plugin uninstall skill-codex@skill-codex`, or remove mcpServers.skill-codex from ~/.claude.json",
    };
  }
  if (isDisabledFor(state, cwd)) {
    return { name: "install", status: "warn", detail: "the skill-codex MCP server is disabled for this project", hint: "in Claude Code: /mcp → skill-codex → Enable" };
  }
  const entry = setupServer?.args[0];
  if (entry && path.resolve(entry) !== path.resolve(root, "dist", "index.js")) {
    return { name: "install", status: "warn", detail: `user-scope registration runs ${entry}, not this build (${root})` };
  }
  return { name: "install", status: "ok", detail: describeRegistration(state) };
}

export async function checkUpdate(current: string = getVersion()): Promise<CheckResult> {
  const result = await runCommand("npm", ["view", "skill-codex", "version"], NPM_TIMEOUT_MS);
  const latest = result.ok ? parseCodexVersion(result.stdout) : null;
  if (!latest) return { name: "update", status: "skip", detail: "could not reach the npm registry" };
  return compareVersions(latest, current) > 0
    ? { name: "update", status: "warn", detail: `skill-codex ${latest} is available (running ${current})`, hint: "`npm i -g skill-codex@latest`, or `/plugin update skill-codex`" }
    : { name: "update", status: "ok", detail: `skill-codex ${current} is the latest` };
}

/** All checks in display order. `offline` skips the ones that call Codex's API or npm. */
export async function runDoctor(options: { offline?: boolean } = {}): Promise<CheckResult[]> {
  const local = [checkBuild(), checkNode(), await checkCodex(), checkInstall(), checkSandbox(), await checkModels()];
  if (options.offline) {
    return [...local, { name: "auth", status: "skip", detail: "skipped (--offline)" }, { name: "update", status: "skip", detail: "skipped (--offline)" }];
  }
  const [auth, update] = await Promise.all([checkAuth(), checkUpdate()]);
  return [...local, auth, update];
}
