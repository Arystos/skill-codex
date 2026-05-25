import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runPreflight } from "../guards/preflight.js";
import { execCodex } from "../runner/exec-runner.js";
import { withRetry } from "../runner/retry.js";
import { BridgeError } from "../errors/errors.js";
import type { CodexResult } from "../runner/output-parser.js";

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
    return `[skill-codex error: ${err.code}] ${err.message}`;
  }
  if (err instanceof Error) {
    return `[skill-codex error] ${err.message}`;
  }
  return `[skill-codex error] Unknown error: ${String(err)}`;
}

function formatRichResponse(
  result: CodexResult,
  input: CodexExecInput,
  cwd: string,
): string {
  const lines: string[] = [];

  const modeLabel = input.mode === "full-auto" ? "full-auto" : "read-only";
  const metaParts: string[] = [modeLabel, cwd];

  if (result.usage) {
    const {
      input_tokens: inp,
      output_tokens: out,
      cached_input_tokens: cached,
      reasoning_output_tokens: reasoning,
    } = result.usage;
    metaParts.push(
      `${inp} tok in${cached > 0 ? ` (${cached} cached)` : ""} \u2192 ${out} out${reasoning > 0 ? ` (+${reasoning} reasoning)` : ""}`,
    );
  }

  lines.push(`[${metaParts.join(" \u2502 ")}]`);

  if (result.activity.length > 0) {
    for (const a of result.activity) {
      if (a.type === "exec") {
        lines.push(`  ${a.icon} exec: ${a.command}  (${a.status})`);
      } else if (a.type === "read") {
        lines.push(`  \u25B6 read: ${a.path}`);
      } else if (a.type === "write") {
        lines.push(`  \u270E write: ${a.path}`);
      }
    }
  }

  lines.push("");
  lines.push(result.content);

  return lines.join("\n");
}

export async function handleCodexExec(
  input: CodexExecInput,
  serverCwd: string,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const rawCwd = input.cwd ?? serverCwd;
  const cwd = path.resolve(rawCwd);

  // Validate cwd is an existing directory (prevent path traversal to arbitrary locations)
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    return {
      content: [{ type: "text", text: `[skill-codex error: INVALID_CWD] cwd is not an existing directory: ${cwd}` }],
      isError: true,
    };
  }

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

    const formatted = formatRichResponse(result, input, cwd);
    return {
      content: [{ type: "text", text: formatted }],
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
