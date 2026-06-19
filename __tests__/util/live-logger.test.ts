import { describe, it, expect } from "vitest";
import os from "node:os";
import { formatLogLines, resolveLogPath } from "../../src/util/live-logger.js";
import { LOG_ENV } from "../../src/config/constants.js";

describe("formatLogLines", () => {
  it("renders a running command", () => {
    expect(
      formatLogLines({ item: { type: "command_execution", command: "ls -la", status: "in_progress" } }),
    ).toEqual(["  $ ls -la"]);
  });

  it("renders ok / blocked / failed command outcomes", () => {
    expect(
      formatLogLines({ item: { type: "command_execution", status: "completed", exit_code: 0 } }),
    ).toEqual(["    ✔ ok"]);
    expect(
      formatLogLines({ item: { type: "command_execution", status: "declined" } }),
    ).toEqual(["    ✘ blocked"]);
    expect(
      formatLogLines({ item: { type: "command_execution", status: "completed", exit_code: 2 } }),
    ).toEqual(["    ✘ exit 2"]);
  });

  it("renders file reads, writes and edits", () => {
    expect(formatLogLines({ item: { type: "file_read", path: "a.ts" } })).toEqual(["  read   a.ts"]);
    expect(formatLogLines({ item: { type: "file_write", path: "b.ts" } })).toEqual(["  write  b.ts"]);
    expect(formatLogLines({ item: { type: "file_edit", path: "c.ts" } })).toEqual(["  write  c.ts"]);
  });

  it("renders file_change with a changes array", () => {
    expect(
      formatLogLines({
        item: { type: "file_change", changes: [{ path: "a.ts", kind: "modify" }, { path: "b.ts" }] },
      }),
    ).toEqual(["  write  a.ts (modify)", "  write  b.ts (write)"]);
  });

  it("renders file_change without a changes array", () => {
    expect(formatLogLines({ item: { type: "file_change", path: "x.ts" } })).toEqual(["  write  x.ts"]);
  });

  it("renders the final agent message but skips partials", () => {
    expect(
      formatLogLines({ type: "item.completed", item: { type: "agent_message", text: "hi there" } }),
    ).toEqual(["  msg    hi there"]);
    expect(
      formatLogLines({ type: "item.started", item: { type: "agent_message", text: "partial" } }),
    ).toEqual([]);
  });

  it("renders legacy message type", () => {
    expect(formatLogLines({ type: "message", content: "legacy" })).toEqual(["  msg    legacy"]);
  });

  it("renders token usage from turn.completed, with and without reasoning", () => {
    expect(
      formatLogLines({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } }),
    ).toEqual(["  tokens: 10 in → 5 out"]);
    expect(
      formatLogLines({
        type: "turn.completed",
        usage: { input_tokens: 10, output_tokens: 5, reasoning_output_tokens: 3 },
      }),
    ).toEqual(["  tokens: 10 in → 5 out (+3 reasoning)"]);
  });

  it("returns no lines for unknown or malformed events", () => {
    expect(formatLogLines({ type: "turn.started" })).toEqual([]);
    expect(formatLogLines(null)).toEqual([]);
    expect(formatLogLines("nope")).toEqual([]);
    expect(formatLogLines({})).toEqual([]);
  });
});

describe("resolveLogPath", () => {
  it("honors the SKILL_CODEX_LOG override", () => {
    const prev = process.env[LOG_ENV];
    process.env[LOG_ENV] = "/tmp/custom-codex.log";
    try {
      expect(resolveLogPath("/some/cwd")).toMatch(/custom-codex\.log$/);
    } finally {
      if (prev === undefined) delete process.env[LOG_ENV];
      else process.env[LOG_ENV] = prev;
    }
  });

  it("defaults to a per-workspace file under the OS temp dir, never the cwd", () => {
    const prev = process.env[LOG_ENV];
    delete process.env[LOG_ENV];
    try {
      const p = resolveLogPath("/some/project/cwd");
      expect(p.startsWith(os.tmpdir())).toBe(true);
      expect(p).not.toMatch(/[\\/]some[\\/]project[\\/]cwd[\\/]/);
      expect(p).toMatch(/\.log$/);
    } finally {
      if (prev !== undefined) process.env[LOG_ENV] = prev;
    }
  });

  it("is stable for one workspace and distinct across workspaces", () => {
    const prev = process.env[LOG_ENV];
    delete process.env[LOG_ENV];
    try {
      expect(resolveLogPath("/a/proj")).toBe(resolveLogPath("/a/proj"));
      // same basename, different full path -> different hash -> distinct file
      expect(resolveLogPath("/a/proj")).not.toBe(resolveLogPath("/b/proj"));
    } finally {
      if (prev !== undefined) process.env[LOG_ENV] = prev;
    }
  });
});
