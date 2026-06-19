import { WINDOWS_SANDBOX_ENV, WINDOWS_SANDBOX_DEFAULT } from "../config/constants.js";

/**
 * Extra `codex` CLI args needed to make the sandbox usable on the current
 * platform.
 *
 * On Windows, Codex's default elevated sandbox fails to spawn shell processes
 * ("windows sandbox: spawn setup refresh" — openai/codex#24098, #24259), which
 * blocks every command the model runs, including read-only ones. Pinning
 * `windows.sandbox=unelevated` restores reliable spawning. The mode can be
 * overridden via SKILL_CODEX_WINDOWS_SANDBOX (e.g. "elevated") for machines
 * where the elevated sandbox does work.
 *
 * Returns an empty array on non-Windows platforms, where Codex's native
 * sandbox (Seatbelt/Landlock) is used as-is.
 */
export function getSandboxConfigArgs(): readonly string[] {
  if (process.platform !== "win32") return [];
  const raw = process.env[WINDOWS_SANDBOX_ENV]?.trim() || WINDOWS_SANDBOX_DEFAULT;
  // Allowlist: Windows spawns via shell:true, so reject anything but a bare mode
  // token to keep a stray env value from injecting extra shell args.
  const mode = /^[a-z-]+$/.test(raw) ? raw : WINDOWS_SANDBOX_DEFAULT;
  return ["-c", `windows.sandbox=${mode}`];
}
