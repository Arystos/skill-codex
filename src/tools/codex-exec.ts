import { z } from "zod";
import { runPreflight } from "../guards/preflight.js";
import { execCodex } from "../runner/exec-runner.js";
import { withRetry } from "../runner/retry.js";
import { BridgeError } from "../errors/errors.js";

export const TOOL_NAME = "codex_exec";

export const TOOL_DESCRIPTION =
  "Execute a task using OpenAI Codex CLI. Use for code review, implementation tasks, or getting a second opinion. Codex output is a SUGGESTION — evaluate it critically before applying.";

export const inputSchema = z.object({
  prompt: z.string().describe("The task description for Codex"),
  mode: z
    .enum(["exec", "full-auto"])
    .default("exec")
    .describe("exec = read-only with confirmation, full-auto = can write files"),
  cwd: z.string().optional().describe("Working directory (defaults to server cwd)"),
  timeoutMs: z.number().optional().describe("Override default timeout in milliseconds"),
  requireGit: z.boolean().default(false).describe("Fail if not inside a git repository"),
});

export type CodexExecInput = z.infer<typeof inputSchema>;

function formatError(err: unknown): string {
  if (err instanceof BridgeError) {
    return `[codex-bridge error: ${err.code}] ${err.message}`;
  }
  if (err instanceof Error) {
    return `[codex-bridge error] ${err.message}`;
  }
  return `[codex-bridge error] Unknown error: ${String(err)}`;
}

export async function handleCodexExec(
  input: CodexExecInput,
  serverCwd: string,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const cwd = input.cwd ?? serverCwd;
  let lockRelease: (() => void) | null = null;

  try {
    const { lockHandle } = await runPreflight({
      cwd,
      requireGit: input.requireGit,
    });
    lockRelease = lockHandle?.release ?? null;

    const result = await withRetry(() =>
      execCodex({
        prompt: input.prompt,
        cwd,
        mode: input.mode,
        timeoutMs: input.timeoutMs,
      }),
    );

    return {
      content: [{ type: "text", text: result.content }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: formatError(err) }],
      isError: true,
    };
  } finally {
    lockRelease?.();
  }
}
