import {
  WINDOWS_SANDBOX_ENV,
  WINDOWS_SANDBOX_DEFAULT,
  WINDOWS_SANDBOX_MODES,
  type WindowsSandboxMode,
} from "../config/constants.js";

/**
 * Extra `codex` CLI args needed to make the sandbox usable on the current
 * platform.
 *
 * On Windows we pin `windows.sandbox=unelevated`. Re-tested on codex-cli
 * 0.163.0: the old elevated-sandbox spawn failure (openai/codex#24098, #24259)
 * is fixed, and every backend blocks writes outside the workspace. But the
 * elevated backend runs commands as a separate local account, so git rejects
 * the user's repos with "detected dubious ownership", and the mxc backend fails
 * `git status` outright. Only unelevated runs git cleanly. The pin overrides
 * `[windows] sandbox` in ~/.codex/config.toml; set SKILL_CODEX_WINDOWS_SANDBOX
 * to `elevated`, `unelevated` or `mxc` to choose a different backend.
 *
 * Returns an empty array on non-Windows platforms, where Codex's native
 * sandbox (Seatbelt/Landlock) is used as-is.
 */
export function getSandboxConfigArgs(): readonly string[] {
  if (process.platform !== "win32") return [];
  return ["-c", `windows.sandbox=${resolveWindowsSandboxMode()}`];
}

function isWindowsSandboxMode(value: string): value is WindowsSandboxMode {
  return (WINDOWS_SANDBOX_MODES as readonly string[]).includes(value);
}

/**
 * Read the override from the environment. Only the exact modes Codex accepts
 * pass: Windows spawns via shell:true, so an arbitrary value could inject extra
 * shell args. Anything else is reported on stderr and replaced by the default.
 */
function resolveWindowsSandboxMode(): WindowsSandboxMode {
  const raw = process.env[WINDOWS_SANDBOX_ENV]?.trim().toLowerCase();
  if (!raw) return WINDOWS_SANDBOX_DEFAULT;
  if (isWindowsSandboxMode(raw)) return raw;
  process.stderr.write(
    `[skill-codex] Ignoring ${WINDOWS_SANDBOX_ENV}=${JSON.stringify(raw)}: ` +
      `expected one of ${WINDOWS_SANDBOX_MODES.join(", ")}. Using "${WINDOWS_SANDBOX_DEFAULT}".\n`,
  );
  return WINDOWS_SANDBOX_DEFAULT;
}
