import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_ACTIVITY_LINES, MAX_RESPONSE_CHARS } from "../config/constants.js";
import { BridgeError } from "../errors/errors.js";
import type { ActivityEntry, CodexResult } from "../runner/output-parser.js";
import { truncateResponse } from "../util/truncate.js";

/** The parts of a codex_exec call that the response header describes. */
export interface CallMeta {
  readonly mode: "exec" | "full-auto";
  readonly sandbox?: string;
  readonly sessionId?: string;
  readonly review?: boolean;
  readonly model?: string;
  readonly reasoningEffort?: string;
}

export interface FormatOptions {
  /** One-line notices shown under the header (version drift, model fallback). */
  readonly notes?: readonly string[];
  /** Where the untruncated Codex message was saved, when it was too long to inline. */
  readonly fullOutputPath?: string | null;
}

export function formatError(err: unknown): string {
  if (err instanceof BridgeError) {
    return `[skill-codex error: ${err.code}] ${err.message}`;
  }
  if (err instanceof Error) {
    return `[skill-codex error] ${err.message}`;
  }
  return `[skill-codex error] Unknown error: ${String(err)}`;
}

function formatMetaLine(result: CodexResult, meta: CallMeta, cwd: string): string {
  // On resume, no --sandbox is sent (the session keeps its original policy), so
  // labelling it with a specific mode would be misleading — show "resumed" instead.
  const sandboxLabel = meta.sandbox ?? (meta.mode === "full-auto" ? "workspace-write" : "read-only");
  const label = meta.review ? "review" : meta.sessionId ? "resumed" : sandboxLabel;
  const parts: string[] = [label];

  if (meta.model) parts.push(meta.model);
  if (meta.reasoningEffort) parts.push(`effort:${meta.reasoningEffort}`);
  parts.push(cwd);
  if (typeof result.durationMs === "number") parts.push(`${(result.durationMs / 1000).toFixed(1)}s`);

  if (result.usage) {
    const {
      input_tokens: inp,
      output_tokens: out,
      cached_input_tokens: cached,
      cache_write_input_tokens: cacheWrite,
      reasoning_output_tokens: reasoning,
    } = result.usage;
    parts.push(
      `${inp} tok in${cached > 0 ? ` (${cached} cached)` : ""}${cacheWrite > 0 ? ` (${cacheWrite} cache write)` : ""} → ${out} out${reasoning > 0 ? ` (+${reasoning} reasoning)` : ""}`,
    );
  }

  return `[${parts.join(" │ ")}]`;
}

/** Activity lines, keeping only the most recent entries so a busy run can't flood the context. */
export function formatActivity(activity: readonly ActivityEntry[], max: number = MAX_ACTIVITY_LINES): string[] {
  const shown = activity.slice(-max);
  const lines = shown.map((a) =>
    a.type === "exec" ? `  ${a.icon} exec: ${a.command}  (${a.status})` : `  ✎ write: ${a.path}`,
  );
  const hidden = activity.length - shown.length;
  return hidden > 0 ? [`  … ${hidden} earlier actions omitted (see live log)`, ...lines] : lines;
}

export function formatRichResponse(result: CodexResult, meta: CallMeta, cwd: string, options: FormatOptions = {}): string {
  const lines: string[] = [formatMetaLine(result, meta, cwd)];

  for (const note of options.notes ?? []) lines.push(`  note: ${note}`);
  if (result.sessionId) {
    lines.push(`  session: ${result.sessionId} (pass as sessionId to continue this conversation)`);
  }
  if (result.logPath) lines.push(`  live log: ${result.logPath}`);
  lines.push(...formatActivity(result.activity));

  lines.push("");
  lines.push(truncateResponse(result.content, MAX_RESPONSE_CHARS, options.fullOutputPath ?? undefined));
  return lines.join("\n");
}

/**
 * When Codex's message is too long to inline, save the full text so Claude can
 * still read it (next to the live log, else in the OS temp dir). Returns the
 * path, or null when no save was needed or the write failed.
 */
export function saveFullOutput(content: string, logPath?: string, maxChars: number = MAX_RESPONSE_CHARS): string | null {
  if (content.length <= maxChars) return null;
  const dir = logPath ? path.dirname(logPath) : os.tmpdir();
  const target = path.join(dir, `skill-codex-output-${Date.now()}.md`);
  try {
    fs.writeFileSync(target, content, "utf-8");
    return target;
  } catch {
    return null;
  }
}
