import fs from "node:fs";
import path from "node:path";
import { LOG_FILENAME, LOG_ENV } from "../config/constants.js";
import { oneLine } from "./text.js";

export interface LiveLoggerOptions {
  readonly cwd: string;
  readonly mode: string;
  readonly prompt: string;
}

export interface LiveLogger {
  readonly path: string;
  /** Feed a raw stdout fragment; complete JSONL lines are rendered as they arrive. */
  write(fragment: string): void;
  /** Flush any trailing partial line and write the footer. */
  finish(summary: string): void;
}

/**
 * Resolve the live-log path: `SKILL_CODEX_LOG` override (absolute), else
 * `<cwd>/.skill-codex.log`.
 */
export function resolveLogPath(cwd: string): string {
  const override = process.env[LOG_ENV];
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(cwd, LOG_FILENAME);
}

/**
 * Render a parsed Codex JSONL event as zero or more human-readable log lines.
 * Pure (no I/O) so it can be unit-tested in isolation; `createLiveLogger`
 * wraps it with file buffering.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatLogLines(evt: any): string[] {
  if (!evt || typeof evt !== "object") return [];

  const item = evt.item;

  if (item?.type === "command_execution") {
    if (item.status === "in_progress") return [`  $ ${oneLine(String(item.command ?? ""), 120)}`];
    if (item.status === "declined") return ["    ✘ blocked"];
    if (item.exit_code === 0) return ["    ✔ ok"];
    return [`    ✘ exit ${String(item.exit_code)}`];
  }

  if (item?.type === "file_read") return [`  read   ${String(item.path ?? "file")}`];

  if (item?.type === "file_write" || item?.type === "file_edit") {
    return [`  write  ${String(item.path ?? "file")}`];
  }

  if (item?.type === "file_change") {
    const changes = Array.isArray(item.changes) ? item.changes : null;
    if (changes && changes.length > 0) {
      return changes.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (change: any) => `  write  ${String(change?.path ?? "file")} (${String(change?.kind ?? "write")})`,
      );
    }
    return [`  write  ${String(item.path ?? "file")}`];
  }

  if (
    item?.type === "agent_message" &&
    typeof item.text === "string" &&
    evt.type !== "item.started" &&
    evt.type !== "item.updated"
  ) {
    return [`  msg    ${oneLine(item.text, 400)}`];
  }

  if (evt.type === "message" && typeof evt.content === "string") {
    return [`  msg    ${oneLine(evt.content, 400)}`];
  }

  if (evt.type === "turn.completed" && evt.usage) {
    const u = evt.usage;
    const reasoning = u.reasoning_output_tokens ?? 0;
    return [
      `  tokens: ${u.input_tokens ?? 0} in → ${u.output_tokens ?? 0} out${reasoning > 0 ? ` (+${reasoning} reasoning)` : ""}`,
    ];
  }

  return [];
}

/**
 * Human-readable, append-only log of a single Codex run. Codex emits JSONL on
 * stdout; this tails each event to a file so the user can `tail -f` a run that
 * the MCP transport would otherwise buffer until completion. Best-effort: any
 * filesystem error is swallowed so logging never breaks an actual Codex call.
 */
export function createLiveLogger(opts: LiveLoggerOptions): LiveLogger {
  const logPath = resolveLogPath(opts.cwd);

  let stream: fs.WriteStream | null = null;
  try {
    stream = fs.createWriteStream(logPath, { flags: "a" });
  } catch {
    stream = null;
  }

  const line = (text: string): void => {
    try {
      stream?.write(text + "\n");
    } catch {
      // best-effort logging — never throw
    }
  };

  const startedAt = new Date().toISOString();
  line("");
  line("=".repeat(60));
  line(`> codex ${opts.mode}  ${startedAt}`);
  line(`  cwd:  ${opts.cwd}`);
  line(`  task: ${oneLine(opts.prompt, 200)}`);
  line("-".repeat(60));

  const handleEvent = (raw: string): void => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let evt: any;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      return; // non-JSON preamble — skip
    }
    for (const l of formatLogLines(evt)) line(l);
  };

  let buffer = "";

  return {
    path: logPath,
    write(fragment: string): void {
      buffer += fragment;
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const lineStr = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleEvent(lineStr);
      }
    },
    finish(summary: string): void {
      if (buffer.trim()) {
        handleEvent(buffer);
        buffer = "";
      }
      line("-".repeat(60));
      line(`# done  ${new Date().toISOString()}  ${summary}`);
      try {
        stream?.end();
      } catch {
        // ignore
      }
    },
  };
}
