import { VERIFIED_CODEX_VERSION } from "../config/codex-contract.js";
import { runCodexCommand } from "./cli.js";

let cachedVersion: string | null | undefined;
let noticeShown = false;

export function resetVersionCache(): void {
  cachedVersion = undefined;
  noticeShown = false;
}

/** "codex-cli 0.163.0" → "0.163.0" (pre-release suffixes dropped); null if absent. */
export function parseCodexVersion(output: string): string | null {
  return output.match(/(\d+)\.(\d+)\.(\d+)/)?.[0] ?? null;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function minorOf(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

/**
 * A one-line warning when the installed Codex differs from the verified one
 * by a minor version or more. Patch releases are treated as compatible.
 */
export function codexVersionNotice(installed: string, verified: string = VERIFIED_CODEX_VERSION): string | null {
  if (minorOf(installed) === minorOf(verified)) return null;
  if (compareVersions(installed, verified) > 0) {
    return (
      `codex-cli ${installed} is newer than ${verified}, the version this skill-codex release was verified on. ` +
      "If Codex calls misbehave, run `npx skill-codex doctor` and check for a skill-codex update."
    );
  }
  return (
    `codex-cli ${installed} is older than ${verified}, the version this skill-codex release was verified on. ` +
    "Update Codex: `npm i -g @openai/codex`."
  );
}

/** Installed codex-cli version, cached per process; null if it can't be read. */
export async function getInstalledCodexVersion(): Promise<string | null> {
  if (cachedVersion !== undefined) return cachedVersion;
  const result = await runCodexCommand(["--version"]);
  cachedVersion = result.ok ? parseCodexVersion(result.stdout) : null;
  return cachedVersion;
}

/** The version notice, at most once per server process so it doesn't repeat on every call. */
export async function takeCodexVersionNotice(): Promise<string | null> {
  if (noticeShown) return null;
  const installed = await getInstalledCodexVersion();
  if (!installed) return null;
  noticeShown = true;
  return codexVersionNotice(installed);
}
