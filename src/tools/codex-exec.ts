import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runPreflight } from "../guards/preflight.js";
import { execCodex } from "../runner/exec-runner.js";
import { withRetry } from "../runner/retry.js";
import { MAX_ADD_DIRS } from "../config/constants.js";
import { resolveAddDirs } from "./add-dirs.js";
import { InvalidRequestError } from "../errors/errors.js";
import type { CodexResult } from "../runner/output-parser.js";
import { describeModelsForTool, listAvailableModels, readConfiguredModel } from "../codex/models.js";
import { takeCodexVersionNotice } from "../codex/version-check.js";
import { formatError, formatRichResponse, saveFullOutput } from "./format-response.js";

export const TOOL_NAME = "codex_exec";

export const TOOL_DESCRIPTION =
  "Execute a task using OpenAI Codex CLI. Use for code review, implementation tasks, or getting a second opinion. Codex output is a SUGGESTION — evaluate it critically before applying.";

/**
 * Shared by the zod schema and the advertised JSON Schema. At tools/list time
 * the server appends this account's live model list (see getToolDefinition),
 * so Claude can route by task without a frozen, plan-dependent catalog.
 */
export const MODEL_DESCRIPTION =
  "Codex model for this call. If the user named a model, use exactly that. Otherwise choose from the models listed below to fit the task: " +
  "the strongest one for code review, security-sensitive or multi-file implementation work; a fast, cheap one for quick questions, summaries and small edits. " +
  "Omit it to use the user's configured default, which is also the safe choice when unsure or when no list is shown. " +
  "A model Codex rejects for this account falls back to the default automatically.";

export const ADD_DIRS_DESCRIPTION =
  "Extra directories Codex may WRITE to besides cwd (codex exec --add-dir), e.g. sibling packages in a monorepo. " +
  "Absolute, or relative to cwd; each must exist. This widens what Codex can modify, so pass only directories the task needs. " +
  "Needs a writable sandbox (mode full-auto, or sandbox workspace-write / danger-full-access); not supported with review or sessionId.";

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
    .describe(MODEL_DESCRIPTION),
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
  addDirs: z
    .array(z.string().min(1).max(4096))
    .max(MAX_ADD_DIRS)
    .optional()
    .describe(ADD_DIRS_DESCRIPTION),
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
      description: MODEL_DESCRIPTION,
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
    addDirs: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 4096 },
      maxItems: MAX_ADD_DIRS,
      description: ADD_DIRS_DESCRIPTION,
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

/**
 * The tool as advertised in tools/list: the static schema plus this account's
 * live model list in the `model` description. Falls back to the static schema
 * when the catalog can't be read.
 */
export async function getToolDefinition(): Promise<{
  name: string;
  description: string;
  inputSchema: typeof TOOL_INPUT_JSON_SCHEMA;
}> {
  const modelList = describeModelsForTool(await listAvailableModels(), readConfiguredModel());
  const inputSchema = modelList
    ? {
        ...TOOL_INPUT_JSON_SCHEMA,
        properties: {
          ...TOOL_INPUT_JSON_SCHEMA.properties,
          model: { ...TOOL_INPUT_JSON_SCHEMA.properties.model, description: `${MODEL_DESCRIPTION}\n\n${modelList}` },
        },
      }
    : TOOL_INPUT_JSON_SCHEMA;
  return { name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema };
}

/** The sandbox a fresh `codex exec` runs under: explicit `sandbox`, else derived from `mode`. */
function effectiveSandbox(input: CodexExecInput): "read-only" | "workspace-write" | "danger-full-access" {
  return input.sandbox ?? (input.mode === "full-auto" ? "workspace-write" : "read-only");
}

function isModelRejection(err: unknown): err is InvalidRequestError {
  return err instanceof InvalidRequestError && /model/i.test(err.detail);
}

/**
 * Run Codex; if Claude picked a model this account can't use, retry once with
 * the configured default and say so — a routing guess must never fail a call.
 */
async function runWithModelFallback(
  input: CodexExecInput,
  cwd: string,
  addDirs: readonly string[],
  onProgress?: (message: string) => void,
): Promise<{ result: CodexResult; model: string | undefined; fallbackNote: string | null }> {
  const run = (model: string | undefined): Promise<CodexResult> =>
    withRetry(() =>
      execCodex({
        prompt: input.prompt ?? "",
        cwd,
        mode: input.mode,
        sandbox: input.sandbox,
        sessionId: input.sessionId,
        model,
        reasoningEffort: input.reasoningEffort,
        review: input.review,
        reviewBase: input.reviewBase,
        reviewCommit: input.reviewCommit,
        timeoutMs: input.timeoutMs,
        addDirs,
        onProgress,
      }),
    );

  try {
    return { result: await run(input.model), model: input.model, fallbackNote: null };
  } catch (err) {
    if (!input.model || !isModelRejection(err)) throw err;
    const fallbackNote = `model ${input.model} was rejected (${err.detail.replace(/\.\s*$/, "")}) — ran with the configured default instead.`;
    return { result: await run(undefined), model: undefined, fallbackNote };
  }
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

  // --add-dir exists only on a fresh `codex exec`, and Codex ignores it
  // without a writable sandbox, so reject those combinations up front.
  const addDirsGiven = (input.addDirs?.length ?? 0) > 0;
  if (addDirsGiven && input.review) return optError("addDirs is not supported with review");
  if (addDirsGiven && input.sessionId) {
    return optError("addDirs is not supported with sessionId: a resumed session keeps its original writable roots");
  }
  if (addDirsGiven && effectiveSandbox(input) === "read-only") {
    return optError(
      "addDirs needs a writable sandbox: set mode to full-auto, or sandbox to workspace-write or danger-full-access (read-only Codex ignores --add-dir)",
    );
  }
  const addDirs = resolveAddDirs(input.addDirs ?? [], cwd);
  if (!addDirs.ok) {
    return {
      content: [{ type: "text", text: `[skill-codex error: INVALID_ADD_DIR] ${addDirs.error}` }],
      isError: true,
    };
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

    const versionNotice = await takeCodexVersionNotice();
    const run = await runWithModelFallback(input, cwd, addDirs.dirs, onProgress);
    const notes = [versionNotice, run.fallbackNote].filter((n): n is string => n !== null);
    const fullOutputPath = saveFullOutput(run.result.content, run.result.logPath);

    const formatted = formatRichResponse(run.result, { ...input, model: run.model, addDirs: addDirs.dirs }, cwd, {
      notes,
      fullOutputPath,
    });
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
