import { BridgeError } from "../errors/errors.js";

/**
 * Characters allowed in a filesystem path that skill-codex passes to the codex
 * CLI as an argument (`--output-schema <FILE>`, `--add-dir <DIR>`).
 *
 * On Windows the runner spawns through cmd.exe (`shell: true`, needed for
 * npm's `codex.cmd` shim), and Node does not quote the arguments. The runner
 * wraps each path in double quotes, but inside quotes cmd.exe still expands
 * `%VAR%`, and `"` ends the quoting. So any character outside this allowlist
 * is rejected, not escaped: letters and digits in any script, combining
 * marks, space, and `. _ - : \ / ( ) + @ , ~ ' # [ ] { } =`.
 */
const SHELL_SAFE_PATH = /^[\p{L}\p{M}\p{N} ._\-:\\/()+@,~'#[\]{}=]+$/u;

/** True when `p` can reach the codex spawn as an argument without shell interpretation. */
export function isShellSafePath(p: string): boolean {
  return SHELL_SAFE_PATH.test(p);
}

/**
 * The argv form of an absolute path for the codex spawn.
 *
 * On Windows: the path in double quotes, so spaces survive cmd.exe. Trailing
 * backslashes are doubled because, under the MSVC argv rules Node and Rust
 * use, `\"` is an escaped quote: `"C:\"` would swallow the closing quote.
 * Elsewhere spawn passes argv directly (no shell), so the path goes as-is.
 *
 * Throws for a path outside the allowlist. Callers validate user paths first
 * with isShellSafePath; this check keeps the spawn itself safe.
 */
export function toPathArg(p: string, platform: NodeJS.Platform = process.platform): string {
  if (!isShellSafePath(p)) {
    throw new BridgeError(`Path contains characters that are unsafe to pass to codex: ${p}`, "UNSAFE_PATH", false);
  }
  if (platform !== "win32") return p;
  const trailing = /\\+$/.exec(p)?.[0] ?? "";
  return `"${p}${trailing}"`;
}
