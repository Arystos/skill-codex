import { execFileSync } from "node:child_process";
import {
  WINDOWS_SANDBOX_ENV,
  WINDOWS_SANDBOX_DEFAULT,
  WINDOWS_SANDBOX_MODES,
  type WindowsSandboxMode,
} from "../config/constants.js";
import { readConfigString } from "../codex/codex-config.js";

/**
 * Windows sandbox backends, re-tested on codex-cli 0.163.0. All three block
 * writes outside the workspace; they differ in what commands can do:
 * - unelevated: Codex can run git directly, but any process that starts a
 *   child process (npm, vitest, esbuild, a script calling git) fails with
 *   EPERM — so Codex can't run builds or tests (#26).
 * - elevated: child processes work, but commands run as a separate local
 *   account (CodexSandboxOffline), so git rejects the user's repo with
 *   "detected dubious ownership". getSandboxGitEnv fixes that by trusting the
 *   workspace repo through git's GIT_CONFIG_* environment variables.
 * - mxc: `git status` fails ("this operation must be run in a work tree").
 *
 * The mode comes from SKILL_CODEX_WINDOWS_SANDBOX, else `[windows] sandbox` in
 * ~/.codex/config.toml, else unelevated (the one backend that needs no
 * one-time elevated setup).
 */
export interface WindowsSandboxChoice {
  readonly mode: WindowsSandboxMode;
  readonly source: "env" | "config" | "default";
  /** A rejected SKILL_CODEX_WINDOWS_SANDBOX value, reported to the user. */
  readonly invalidOverride?: string;
}

function isWindowsSandboxMode(value: string | null | undefined): value is WindowsSandboxMode {
  return (WINDOWS_SANDBOX_MODES as readonly (string | null | undefined)[]).includes(value);
}

/**
 * Pick the backend. Only the exact modes Codex accepts pass: Windows spawns
 * via a shell, so an arbitrary value could inject extra shell args.
 */
export function resolveWindowsSandbox(envValue: string | undefined, configValue: string | null): WindowsSandboxChoice {
  const raw = envValue?.trim().toLowerCase();
  const invalid = raw && !isWindowsSandboxMode(raw) ? { invalidOverride: raw } : {};
  if (isWindowsSandboxMode(raw)) return { mode: raw, source: "env" };
  const configured = configValue?.trim().toLowerCase();
  if (isWindowsSandboxMode(configured)) return { mode: configured, source: "config", ...invalid };
  return { mode: WINDOWS_SANDBOX_DEFAULT, source: "default", ...invalid };
}

/** The backend for this machine, from the environment and the user's Codex config. */
export function currentWindowsSandbox(): WindowsSandboxChoice {
  return resolveWindowsSandbox(process.env[WINDOWS_SANDBOX_ENV], readConfigString("sandbox", "windows"));
}

/**
 * Extra `codex` CLI args for the Windows sandbox backend. Empty on other
 * platforms, where Codex's native sandbox (Seatbelt/Landlock) is used as-is.
 */
export function getSandboxConfigArgs(): readonly string[] {
  if (process.platform !== "win32") return [];
  const choice = currentWindowsSandbox();
  if (choice.invalidOverride) {
    process.stderr.write(
      `[skill-codex] Ignoring ${WINDOWS_SANDBOX_ENV}=${JSON.stringify(choice.invalidOverride)}: ` +
        `expected one of ${WINDOWS_SANDBOX_MODES.join(", ")}. Using "${choice.mode}".\n`,
    );
  }
  return ["-c", `windows.sandbox=${choice.mode}`];
}

function gitTopLevel(cwd: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return out.trim() || null;
  } catch {
    return null; // not a git repo, or git missing — nothing to trust
  }
}

/**
 * Environment for the Codex process so git works under the elevated backend:
 * trust the workspace repo (only that repo) via `safe.directory`. Entries are
 * appended after any GIT_CONFIG_* the environment already defines, since
 * Codex adds its own.
 */
export function getSandboxGitEnv(
  cwd: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
  findTopLevel: (cwd: string) => string | null = gitTopLevel,
): Record<string, string> {
  if (process.platform !== "win32" || currentWindowsSandbox().mode !== "elevated") return {};
  const topLevel = findTopLevel(cwd);
  if (!topLevel) return {};
  const existing = Number.parseInt(baseEnv.GIT_CONFIG_COUNT ?? "0", 10);
  const index = Number.isInteger(existing) && existing >= 0 ? existing : 0;
  return {
    GIT_CONFIG_COUNT: String(index + 1),
    [`GIT_CONFIG_KEY_${index}`]: "safe.directory",
    [`GIT_CONFIG_VALUE_${index}`]: topLevel,
  };
}
