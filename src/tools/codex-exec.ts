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
  prompt: z.string().optional().describe("The task description for Codex"),
  mode: z
    .enum(["exec", "full-auto"])
    .default("exec")
    .describe("exec = read-only with confirmation, full-auto = can write files"),
  sandbox: z
    .enum(["read-only", "workspace-write", "danger-full-access"])
    .optional()
    .describe(
      "Explicit Codex sandbox policy; overrides mode. read-only = no writes, workspace-write = write within cwd, danger-full-access = unrestricted (use with care).",
    ),
  sessionId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/, "sessionId must be a Codex thread id (letters, digits, '-', '_')")
    .optional()
    .describe(
      "Resume a prior Codex session by its thread id (returned in a previous response) so Codex retains context across calls.",
    ),
  model: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,64}$/)
    .optional()
    .describe(
      "Codex model to use (e.g. gpt-5.5, gpt-5.4, gpt-5.4-mini). Omit to use Codex's configured default.",
    ),
  reasoningEffort: z
    .enum(["minimal", "low", "medium", "high", "xhigh"])
    .optional()
    .describe("How much reasoning effort Codex spends. Omit for the model's default."),
  review: z
    .boolean()
    .optional()
    .describe(
      "Run Codex's native diff-scoped review (`codex exec review`) instead of a freeform prompt. The prompt becomes optional custom review instructions.",
    ),
  reviewBase: z
    .string()
    .regex(/^[A-Za-z0-9._\/-]{1,128}$/)
    .optional()
    .describe("With review: diff against this base branch (default: uncommitted changes)."),
  reviewCommit: z
    .string()
    .regex(/^[0-9a-fA-F]{4,64}$/)
    .optional()
    .describe("With review: review the changes introduced by this commit SHA."),
  cwd: z.string().optional().describe("Working directory (defaults to server cwd)"),
  timeoutMs: z.number().optional().describe("Override default timeout in milliseconds"),
  requireGit: z.boolean().default(false).describe("Fail if not inside a git repository"),
});

export type CodexExecInput = z.infer<typeof inputSchema>;

/**
 * JSON Schema advertised to MCP clients in the `tools/list` response. Kept here
 * next to the zod `inputSchema` (the runtime validator) so the two can't drift —
 * a sync test asserts their property sets match. The MCP SDK wants a plain JSON
 * Schema object, so we hand-write it rather than deriving it at runtime.
 */
export const TOOL_INPUT_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    prompt: { type: "string", description: "The task description for Codex" },
    mode: {
      type: "string",
      enum: ["exec", "full-auto"],
      default: "exec",
      description: "exec = read-only, full-auto = can write files",
    },
    sandbox: {
      type: "string",
      enum: ["read-only", "workspace-write", "danger-full-access"],
      description:
        "Explicit Codex sandbox policy; overrides mode. read-only = no writes, workspace-write = write within cwd, danger-full-access = unrestricted (use with care).",
    },
    sessionId: {
      type: "string",
      pattern: "^[A-Za-z0-9_-]{1,128}$",
      description:
        "Resume a prior Codex session by its thread id (returned in a previous response) so Codex retains context across calls.",
    },
    model: {
      type: "string",
      pattern: "^[A-Za-z0-9._-]{1,64}$",
      description:
        "Codex model to use (e.g. gpt-5.5, gpt-5.4, gpt-5.4-mini). Omit to use Codex's configured default.",
    },
    reasoningEffort: {
      type: "string",
      enum: ["minimal", "low", "medium", "high", "xhigh"],
      description: "How much reasoning effort Codex spends. Omit for the model's default.",
    },
    review: {
      type: "boolean",
      description:
        "Run Codex's native diff-scoped review (`codex exec review`) instead of a freeform prompt. The prompt becomes optional custom review instructions.",
    },
    reviewBase: {
      type: "string",
      pattern: "^[A-Za-z0-9._\\/-]{1,128}$",
      description: "With review: diff against this base branch (default: uncommitted changes).",
    },
    reviewCommit: {
      type: "string",
      pattern: "^[0-9a-fA-F]{4,64}$",
      description: "With review: review the changes introduced by this commit SHA.",
    },
    cwd: { type: "string", description: "Working directory (defaults to server cwd)" },
    timeoutMs: { type: "number", description: "Override default timeout in milliseconds" },
    requireGit: {
      type: "boolean",
      default: false,
      description: "Fail if not inside a git repository",
    },
  },
  required: [],
};

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

  // On resume, no --sandbox is sent (the session keeps its original policy), so
  // labelling it with a specific mode would be misleading — show "resumed" instead.
  const sandboxLabel = input.sandbox ?? (input.mode === "full-auto" ? "workspace-write" : "read-only");
  const label = input.review ? "review" : input.sessionId ? "resumed" : sandboxLabel;
  const metaParts: string[] = [label];

  if (input.model) {
    metaParts.push(input.model);
  }

  if (input.reasoningEffort) {
    metaParts.push(`effort:${input.reasoningEffort}`);
  }

  metaParts.push(cwd);

  if (typeof result.durationMs === "number") {
    metaParts.push(`${(result.durationMs / 1000).toFixed(1)}s`);
  }

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

  if (result.sessionId) {
    lines.push(`  session: ${result.sessionId} (pass as sessionId to continue this conversation)`);
  }

  if (result.logPath) {
    lines.push(`  live log: ${result.logPath}`);
  }

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
  onProgress?: (message: string) => void,
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

  // Reject conflicting/stray options instead of silently ignoring them.
  const optError = (msg: string): { content: Array<{ type: "text"; text: string }>; isError: boolean } => ({
    content: [{ type: "text", text: `[skill-codex error: INVALID_OPTIONS] ${msg}` }],
    isError: true,
  });
  if (input.review && input.sessionId) return optError("review and sessionId are mutually exclusive");
  if (input.reviewBase && input.reviewCommit) return optError("reviewBase and reviewCommit are mutually exclusive");
  if ((input.reviewBase ?? input.reviewCommit) && !input.review) {
    return optError("reviewBase/reviewCommit require review: true");
  }
  // The codex CLI forbids combining a review scope flag with a PROMPT.
  if (input.review && (input.reviewBase ?? input.reviewCommit) && input.prompt?.trim()) {
    return optError(
      "a review target (reviewBase/reviewCommit) can't be combined with a prompt — Codex review takes a target OR instructions, not both",
    );
  }

  // `prompt` is optional only for native review (where it's optional custom
  // instructions). Every other call must supply a prompt.
  if (!input.review && !input.prompt?.trim()) {
    return {
      content: [{ type: "text", text: "[skill-codex error: MISSING_PROMPT] prompt is required unless review is set" }],
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
        prompt: input.prompt ?? "",
        cwd,
        mode: input.mode,
        sandbox: input.sandbox,
        sessionId: input.sessionId,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        review: input.review,
        reviewBase: input.reviewBase,
        reviewCommit: input.reviewCommit,
        timeoutMs: input.timeoutMs,
        onProgress,
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
