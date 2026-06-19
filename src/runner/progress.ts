import { oneLine, baseName } from "../util/text.js";

/**
 * Map a parsed Codex JSONL event to a concise, human-readable status line for
 * MCP `notifications/progress`, or `null` for events that shouldn't surface as
 * progress (turn starts, partial item streams, unknown shapes).
 *
 * Kept pure (no I/O) so it is unit-testable in isolation and reusable by any
 * caller that wants a one-line summary of "what is Codex doing right now".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatProgressMessage(evt: any): string | null {
  if (!evt || typeof evt !== "object") return null;

  const item = evt.item;

  if (item?.type === "command_execution") {
    const cmd = oneLine(String(item.command ?? ""), 60);
    if (item.status === "in_progress") return `running: ${cmd}`;
    if (item.status === "declined") return `blocked: ${cmd}`;
    if (item.exit_code === 0) return `ran: ${cmd}`;
    return `failed (exit ${String(item.exit_code)}): ${cmd}`;
  }

  if (item?.type === "file_read") return `reading ${baseName(String(item.path ?? "file"))}`;

  if (item?.type === "file_write" || item?.type === "file_edit") {
    return `editing ${baseName(String(item.path ?? "file"))}`;
  }

  if (item?.type === "file_change") {
    const changes = Array.isArray(item.changes) ? item.changes : null;
    if (changes && changes.length > 0) {
      return changes.length === 1
        ? `editing ${baseName(String(changes[0]?.path ?? "file"))}`
        : `editing ${changes.length} files`;
    }
    return `editing ${baseName(String(item.path ?? "file"))}`;
  }

  if (item?.type === "reasoning" || evt.type === "turn.started") return "thinking…";

  if (
    item?.type === "agent_message" &&
    typeof item.text === "string" &&
    evt.type !== "item.started" &&
    evt.type !== "item.updated"
  ) {
    return "writing response…";
  }

  return null;
}
