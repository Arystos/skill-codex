// What skill-codex relies on from the Codex CLI. The doctor command and the
// scheduled drift check (scripts/check-codex-drift.ts) compare a Codex install
// against this list, so update it whenever the runner starts using a new flag
// or event — and bump VERIFIED_CODEX_VERSION after a live re-verification.

/** The codex-cli version this release was last verified against end-to-end. */
export const VERIFIED_CODEX_VERSION = "0.163.0";

/** Flags the runner passes, per `codex` subcommand (checked against `--help`). */
export const REQUIRED_FLAGS: Readonly<Record<string, readonly string[]>> = {
  exec: ["--json", "--skip-git-repo-check", "--sandbox", "--model", "--config", "--ephemeral", "--add-dir"],
  "exec review": ["--json", "--skip-git-repo-check", "--uncommitted", "--base", "--commit", "--model", "--config"],
  "exec resume": ["--json", "--skip-git-repo-check", "--model", "--config"],
};

/** Top-level `codex exec --json` event types the parser and progress code read. */
export const PARSED_EVENT_TYPES = [
  "thread.started",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "item.started",
  "item.completed",
] as const;

/** `item.type` values the parser and progress code read. */
export const PARSED_ITEM_TYPES = [
  "agent_message",
  "reasoning",
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "web_search",
  "todo_list",
] as const;

/** Upstream source of the exec JSONL schema, relative to the openai/codex repo root. */
export const EXEC_EVENTS_SCHEMA_PATH = "codex-rs/exec/src/exec_events.rs";
