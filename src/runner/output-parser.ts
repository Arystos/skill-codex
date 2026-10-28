import { EmptyOutputError } from "../errors/errors.js";

// Event and item shapes follow `codex exec --json` as defined in
// codex-rs/exec/src/exec_events.rs (verified against Codex CLI 0.164.0).

export interface ActivityEntry {
  readonly type: "exec" | "write";
  readonly command?: string;
  readonly path?: string;
  readonly icon: string;
  readonly status: string;
}

export interface TokenUsage {
  readonly input_tokens: number;
  readonly cached_input_tokens: number;
  readonly cache_write_input_tokens: number;
  readonly output_tokens: number;
  readonly reasoning_output_tokens: number;
}

export interface CodexResult {
  readonly content: string;
  /**
   * The last agent message alone. With `--output-schema`, Codex constrains
   * only this message; earlier messages in `content` can be prose.
   */
  readonly finalMessage?: string;
  readonly activity: ActivityEntry[];
  readonly usage: TokenUsage | null;
  readonly raw: string;
  readonly sessionId?: string;
  /** Path to the live run log, attached by execCodex. */
  readonly logPath?: string;
  /** Wall-clock duration of the Codex run in ms, attached by execCodex. */
  readonly durationMs?: number;
}

/** Codex's own account of why a turn failed, from a `turn.failed` event. */
export interface TurnFailure {
  /** Human-readable message (the inner API message when Codex wrapped one). */
  readonly message: string;
  /** HTTP status, when the message was a JSON-encoded API error. */
  readonly status?: number;
  /** API error type (e.g. `invalid_request_error`), when present. */
  readonly errorType?: string;
}

const COMMAND_MAX = 80;
const ICON_OK = "✔";
const ICON_FAIL = "✘";
const ICON_WRITE = "✎";

/**
 * Content for a run that did work but ended without a final message. Throwing
 * EmptyOutputError here would be wrong: it is retryable, and a retry repeats
 * the run's file writes and commands.
 */
export const NO_FINAL_MESSAGE = "Codex completed the turn without a final message. See the actions above.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

/** Parse one line as a JSON object; null for non-JSON lines and non-objects. */
function parseJsonObject(line: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed !== null && typeof parsed === "object" ? (parsed as JsonObject) : null;
  } catch {
    return null;
  }
}

/**
 * True for an `item.completed` agent message. The stream may also emit the
 * same item on `item.started`/`item.updated`; counting those would duplicate
 * the final text.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFinalAgentMessage(evt: any): boolean {
  return (
    evt?.type === "item.completed" &&
    evt.item?.type === "agent_message" &&
    typeof evt.item.text === "string"
  );
}

function toTokenUsage(usage: JsonObject): TokenUsage {
  return {
    input_tokens: usage.input_tokens ?? 0,
    cached_input_tokens: usage.cached_input_tokens ?? 0,
    cache_write_input_tokens: usage.cache_write_input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    reasoning_output_tokens: usage.reasoning_output_tokens ?? 0,
  };
}

function execOutcome(cmd: JsonObject): { icon: string; status: string } {
  if (cmd.status === "declined") return { icon: ICON_FAIL, status: "blocked" };
  if (cmd.exit_code === 0) return { icon: ICON_OK, status: "ok" };
  if (typeof cmd.exit_code === "number") return { icon: ICON_FAIL, status: `exit ${cmd.exit_code}` };
  // `exit_code` is null when the command failed before producing one.
  return { icon: ICON_FAIL, status: "failed" };
}

/** Activity for a `command_execution` item; null for in_progress starts. */
function toExecActivity(cmd: JsonObject): ActivityEntry | null {
  if (cmd.status === "in_progress") return null;
  const command = String(cmd.command ?? "");
  const short = command.length > COMMAND_MAX ? command.slice(0, COMMAND_MAX - 3) + "..." : command;
  return { type: "exec", command: short, ...execOutcome(cmd) };
}

/** One write entry per `{ path, kind }` in a `file_change` item. */
function toFileActivity(item: JsonObject): ActivityEntry[] {
  const changes: JsonObject[] = Array.isArray(item.changes) ? item.changes : [];
  return changes.map((change) => ({
    type: "write",
    path: String(change?.path || "file"),
    icon: ICON_WRITE,
    status: String(change?.kind || "write"),
  }));
}

/** Plain-text fallback for output with no agent message, minus the banner/footer. */
function fallbackText(lines: readonly string[]): string {
  return lines
    .filter(
      (line) =>
        !line.startsWith("OpenAI Codex") &&
        !line.startsWith("---") &&
        !line.startsWith("tokens used"),
    )
    .join("\n")
    .trim();
}

export function parseCodexOutput(raw: string): CodexResult {
  if (!raw.trim()) {
    throw new EmptyOutputError();
  }

  const lines = raw.split("\n").filter((line) => line.trim());
  // Local accumulators: filled in one pass, never shared until returned.
  const messages: string[] = [];
  const activity: ActivityEntry[] = [];
  const plainLines: string[] = [];
  let sessionId: string | undefined;
  let usage: TokenUsage | null = null;
  let turnCompleted = false;

  for (const line of lines) {
    // Non-JSON lines are preamble or status output; they only feed the fallback.
    const evt = parseJsonObject(line);
    if (!evt) {
      plainLines.push(line);
      continue;
    }

    if (evt.type === "thread.started" && typeof evt.thread_id === "string") {
      sessionId = evt.thread_id;
    } else if (evt.type === "turn.completed") {
      turnCompleted = true;
      if (evt.usage) usage = toTokenUsage(evt.usage);
    } else if (evt.item?.type === "command_execution") {
      const entry = toExecActivity(evt.item);
      if (entry) activity.push(entry);
    } else if (evt.item?.type === "file_change") {
      activity.push(...toFileActivity(evt.item));
    } else if (isFinalAgentMessage(evt) && evt.item.text.trim()) {
      // Codex can emit an empty agent_message after doing work; it adds nothing.
      messages.push(evt.item.text);
    }
  }

  // Only a stream with no finished turn and no action is empty output:
  // nothing ran, so a retry is safe.
  const content =
    messages.length > 0
      ? messages.join("\n\n")
      : turnCompleted || activity.length > 0
        ? NO_FINAL_MESSAGE
        : fallbackText(plainLines);
  if (!content) {
    throw new EmptyOutputError();
  }

  return {
    content,
    ...(messages.length > 0 ? { finalMessage: messages[messages.length - 1] } : {}),
    activity,
    usage,
    raw,
    sessionId,
  };
}

/**
 * Codex sometimes forwards the raw API error body as the message, e.g.
 * `{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"..."}}`.
 * Unwrap it to the inner human message; keep the string as-is otherwise.
 */
function toTurnFailure(message: string): TurnFailure {
  const body = parseJsonObject(message);
  const inner = body?.error;
  if (!body || Array.isArray(body) || typeof inner?.message !== "string") {
    return { message };
  }
  return {
    message: inner.message,
    ...(typeof body.status === "number" ? { status: body.status } : {}),
    ...(typeof inner.type === "string" ? { errorType: inner.type } : {}),
  };
}

/**
 * The failure reported by the last `turn.failed` event in a `codex exec --json`
 * stream, or null if no turn failed. Top-level `error` events and `error` items
 * are deliberately ignored: Codex emits them while reconnecting or falling back
 * between transports, and the run can still succeed afterwards.
 */
export function extractTurnFailure(raw: string): TurnFailure | null {
  const failures = raw
    .split("\n")
    .map(parseJsonObject)
    .filter((evt) => evt?.type === "turn.failed" && typeof evt.error?.message === "string");
  const last = failures[failures.length - 1];
  return last ? toTurnFailure(last.error.message) : null;
}
