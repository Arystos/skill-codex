import { EmptyOutputError } from "../errors/errors.js";
import { truncateResponse } from "../util/truncate.js";

export interface ActivityEntry {
  readonly type: "exec" | "read" | "write";
  readonly command?: string;
  readonly path?: string;
  readonly icon: string;
  readonly status: string;
}

export interface TokenUsage {
  readonly input_tokens: number;
  readonly cached_input_tokens: number;
  readonly output_tokens: number;
  readonly reasoning_output_tokens: number;
}

export interface CodexResult {
  readonly content: string;
  readonly activity: ActivityEntry[];
  readonly usage: TokenUsage | null;
  readonly raw: string;
  readonly sessionId?: string;
  /** Path to the live run log, attached by execCodex. */
  readonly logPath?: string;
  /** Wall-clock duration of the Codex run in ms, attached by execCodex. */
  readonly durationMs?: number;
}

export function parseCodexOutput(raw: string): CodexResult {
  if (!raw.trim()) {
    throw new EmptyOutputError();
  }

  const lines = raw.split("\n").filter((line) => line.trim());
  const messages: string[] = [];
  const activity: ActivityEntry[] = [];
  let resultContent: string | null = null;
  let sessionId: string | undefined;
  let usage: TokenUsage | null = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      if (parsed.type === "thread.started" && typeof parsed.thread_id === "string") {
        sessionId = parsed.thread_id;
        continue;
      }

      // Extract token usage from turn.completed events
      if (parsed.type === "turn.completed" && parsed.usage) {
        usage = {
          input_tokens: parsed.usage.input_tokens ?? 0,
          cached_input_tokens: parsed.usage.cached_input_tokens ?? 0,
          output_tokens: parsed.usage.output_tokens ?? 0,
          reasoning_output_tokens: parsed.usage.reasoning_output_tokens ?? 0,
        };
        continue;
      }

      // Handle result type — takes priority over all other messages
      if (parsed.type === "result" && typeof parsed.content === "string") {
        resultContent = parsed.content;
        continue;
      }

      // Handle standard event format
      if (parsed.type === "message" && typeof parsed.content === "string") {
        messages.push(parsed.content);
        continue;
      }

      // Track command executions
      if (parsed.item?.type === "command_execution") {
        const cmd = parsed.item;
        const shortCmd =
          cmd.command?.length > 80
            ? cmd.command.slice(0, 77) + "..."
            : cmd.command;
        const statusIcon =
          cmd.status === "declined"
            ? "\u2718"
            : cmd.exit_code === 0
              ? "\u2714"
              : cmd.exit_code !== null
                ? "\u2718"
                : "\u25B6";
        const statusLabel =
          cmd.status === "declined"
            ? "blocked"
            : cmd.status === "in_progress"
              ? "running"
              : cmd.exit_code === 0
                ? "ok"
                : `exit ${cmd.exit_code}`;
        // Only record completed/declined events, not in_progress starts
        if (cmd.status !== "in_progress") {
          activity.push({
            type: "exec",
            command: shortCmd,
            icon: statusIcon,
            status: statusLabel,
          });
        }
        continue;
      }

      // Handle nested item format (Codex JSONL). The current schema emits the
      // final text on `item.completed`; skip `item.started`/`item.updated`
      // partials so streamed chunks aren't double-counted.
      if (
        parsed.item?.type === "agent_message" &&
        typeof parsed.item.text === "string" &&
        parsed.type !== "item.started" &&
        parsed.type !== "item.updated"
      ) {
        messages.push(parsed.item.text);
        continue;
      }

      // Handle flat legacy format
      if (parsed.itemType === "agent_message" && typeof parsed.text === "string") {
        messages.push(parsed.text);
        continue;
      }

      // Track file reads
      if (parsed.item?.type === "file_read") {
        activity.push({
          type: "read",
          path: parsed.item.path || "file",
          icon: "\u25B6",
          status: "read",
        });
        continue;
      }

      // Track file writes/edits (legacy item types, retained for back-compat)
      if (parsed.item?.type === "file_write" || parsed.item?.type === "file_edit") {
        activity.push({
          type: "write",
          path: parsed.item.path || "file",
          icon: "\u270E",
          status: "write",
        });
        continue;
      }

      // Current schema collapses file activity into a single `file_change` item.
      // It may carry a top-level `path` or a `changes` array of { path, kind }.
      if (parsed.item?.type === "file_change") {
        const changes = Array.isArray(parsed.item.changes) ? parsed.item.changes : null;
        if (changes && changes.length > 0) {
          for (const change of changes) {
            activity.push({
              type: "write",
              path: change?.path || "file",
              icon: "\u270E",
              status: change?.kind || "write",
            });
          }
        } else {
          activity.push({
            type: "write",
            path: parsed.item.path || "file",
            icon: "\u270E",
            status: "write",
          });
        }
        continue;
      }
    } catch {
      // Non-JSON line — could be preamble or status output. Skip.
    }
  }

  let agentMessage: string;

  if (resultContent !== null) {
    agentMessage = resultContent;
  } else if (messages.length > 0) {
    agentMessage = messages.join("\n\n");
  } else {
    // If no structured output found, use the raw text (minus any obvious preamble)
    const substantiveLines = lines.filter(
      (line) =>
        !line.startsWith("OpenAI Codex") &&
        !line.startsWith("---") &&
        !line.startsWith("tokens used"),
    );
    agentMessage = substantiveLines.join("\n").trim();
  }

  if (!agentMessage) {
    throw new EmptyOutputError();
  }

  return {
    content: truncateResponse(agentMessage),
    activity,
    usage,
    raw,
    sessionId,
  };
}
