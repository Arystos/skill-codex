import { exec, execFile } from "node:child_process";
import { getCachedBinaryPath } from "../guards/check-binary.js";

export interface CodexCommandResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;

/**
 * One command line for Windows, where npm's `.cmd` shims need a shell. Node 24
 * deprecates passing an args array together with `shell: true` (DEP0190), so
 * the line is built here, quoting any part that contains whitespace.
 */
export function toCommandLine(binary: string, args: readonly string[]): string {
  const quote = (part: string): string => (/\s/.test(part) ? `"${part}"` : part);
  return [binary, ...args].map(quote).join(" ");
}

/**
 * Run a short command with fixed arguments and capture its output. Never
 * throws: failures come back as `ok: false` so callers can degrade gracefully.
 * Only pass constant arguments — on Windows the line goes through a shell.
 */
export function runCommand(
  binary: string,
  args: readonly string[],
  timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<CodexCommandResult> {
  return new Promise((resolve) => {
    const options = { encoding: "utf8" as const, timeout: timeoutMs, maxBuffer: MAX_COMMAND_OUTPUT_BYTES, windowsHide: true };
    const onDone = (error: Error | null, stdout: string, stderr: string): void => {
      resolve({ ok: !error, stdout: String(stdout ?? ""), stderr: String(stderr || error?.message || "") });
    };
    const child =
      process.platform === "win32"
        ? exec(toCommandLine(binary, args), options, onDone)
        : execFile(binary, [...args], options, onDone);
    // `codex exec` appends piped stdin to the prompt and waits for EOF, so close it.
    child.stdin?.end();
  });
}

/** `runCommand` for the codex binary (the cached resolved path when preflight found one). */
export function runCodexCommand(
  args: readonly string[],
  timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<CodexCommandResult> {
  return runCommand(getCachedBinaryPath() ?? "codex", args, timeoutMs);
}
