import { oneLine, baseName } from "../util/text.js";
import { isFinalAgentMessage } from "./output-parser.js";

/** Max characters of command/query/step text in a progress line. */
const PROGRESS_TEXT_MAX = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = Record<string, any>;

function formatCommand(item: Item): string {
  const cmd = oneLine(String(item.command ?? ""), PROGRESS_TEXT_MAX);
  if (item.status === "in_progress") return `running: ${cmd}`;
  if (item.status === "declined") return `blocked: ${cmd}`;
  if (item.exit_code === 0) return `ran: ${cmd}`;
  if (typeof item.exit_code === "number") return `failed (exit ${item.exit_code}): ${cmd}`;
  return `failed: ${cmd}`;
}

function formatFileChange(item: Item): string | null {
  const changes: Item[] = Array.isArray(item.changes) ? item.changes : [];
  if (changes.length === 0) return null;
  return changes.length === 1
    ? `editing ${baseName(String(changes[0]?.path ?? "file"))}`
    : `editing ${changes.length} files`;
}

/** `query` can be empty while a search starts; the action may carry the target. */
function formatWebSearch(evtType: unknown, item: Item): string {
  const target = [item.query, item.action?.query, item.action?.url].find(
    (t): t is string => typeof t === "string" && t.trim() !== "",
  );
  if (!target) return "searching web…";
  const verb = evtType === "item.completed" ? "searched web" : "searching web";
  return `${verb}: ${oneLine(target, PROGRESS_TEXT_MAX)}`;
}

function formatMcpToolCall(item: Item): string {
  const name = oneLine(`${String(item.server ?? "mcp")}/${String(item.tool ?? "tool")}`, PROGRESS_TEXT_MAX);
  if (item.status === "in_progress") return `calling: ${name}`;
  if (item.status === "failed") return `failed: ${name}`;
  return `called: ${name}`;
}

function formatTodoList(item: Item): string | null {
  const steps: Item[] = Array.isArray(item.items) ? item.items : [];
  if (steps.length === 0) return null;
  const done = steps.filter((step) => step?.completed === true).length;
  const next = steps.find((step) => step?.completed !== true);
  return next
    ? `plan ${done}/${steps.length}: ${oneLine(String(next.text ?? ""), PROGRESS_TEXT_MAX)}`
    : `plan ${done}/${steps.length} done`;
}

/**
 * Map a parsed Codex JSONL event to a concise, human-readable status line for
 * MCP `notifications/progress`, or `null` for events that shouldn't surface as
 * progress (partial item streams, transient errors, unknown shapes).
 *
 * Kept pure (no I/O) so it is unit-testable in isolation and reusable by any
 * caller that wants a one-line summary of "what is Codex doing right now".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatProgressMessage(evt: any): string | null {
  if (!evt || typeof evt !== "object") return null;

  const item = evt.item;
  switch (item?.type) {
    case "command_execution":
      return formatCommand(item);
    case "file_change":
      return formatFileChange(item);
    case "web_search":
      return formatWebSearch(evt.type, item);
    case "mcp_tool_call":
      return formatMcpToolCall(item);
    case "todo_list":
      return formatTodoList(item);
    case "reasoning":
      return "thinking…";
  }

  if (evt.type === "turn.started") return "thinking…";
  if (isFinalAgentMessage(evt)) return "writing response…";
  return null;
}

function formatElapsed(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`;
}

/**
 * Heartbeat line for quiet stretches. Claude Code moves long MCP calls to a
 * background task and shows the latest progress there, so the heartbeat
 * carries the current plan step (or, failing that, the last action) instead
 * of a bare timer.
 */
export function formatHeartbeat(elapsedMs: number, lastPlanStep: string | null, lastAction: string | null): string {
  const context = lastPlanStep ?? lastAction;
  const base = `Codex working… ${formatElapsed(elapsedMs)}`;
  return context ? `${base} · ${context}` : base;
}

/** Plan updates from todo_list items start with "plan " (see formatTodoList). */
export function isPlanStep(message: string): boolean {
  return message.startsWith("plan ");
}
