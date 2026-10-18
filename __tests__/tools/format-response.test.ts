import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatActivity,
  formatError,
  formatRichResponse,
  saveFullOutput,
} from "../../src/tools/format-response.js";
import { BridgeError } from "../../src/errors/errors.js";
import { MAX_RESPONSE_CHARS } from "../../src/config/constants.js";
import type { ActivityEntry, CodexResult } from "../../src/runner/output-parser.js";

function result(overrides: Partial<CodexResult> = {}): CodexResult {
  return { content: "done", activity: [], usage: null, raw: "", ...overrides };
}

describe("formatError", () => {
  it("formats bridge errors, plain errors and unknown values", () => {
    expect(formatError(new BridgeError("nope", "X_CODE", false))).toBe("[skill-codex error: X_CODE] nope");
    expect(formatError(new Error("bad"))).toBe("[skill-codex error] bad");
    expect(formatError(42)).toBe("[skill-codex error] Unknown error: 42");
  });
});

describe("formatActivity", () => {
  const exec = (n: number): ActivityEntry => ({ type: "exec", command: `cmd${n}`, status: "ok", icon: "✔" });

  it("renders exec and write entries", () => {
    expect(formatActivity([exec(1), { type: "write", path: "a.ts" }])).toEqual([
      "  ✔ exec: cmd1  (ok)",
      "  ✎ write: a.ts",
    ]);
  });

  it("keeps only the most recent entries and says how many were dropped", () => {
    const lines = formatActivity([exec(1), exec(2), exec(3)], 2);
    expect(lines).toEqual(["  … 1 earlier actions omitted (see live log)", "  ✔ exec: cmd2  (ok)", "  ✔ exec: cmd3  (ok)"]);
  });
});

describe("formatRichResponse", () => {
  it("shows notes under the header", () => {
    const text = formatRichResponse(result(), { mode: "exec" }, "/repo", { notes: ["codex-cli is newer"] });
    expect(text.split("\n")[1]).toBe("  note: codex-cli is newer");
  });

  it("truncates long content and points to the saved full output", () => {
    const long = "x".repeat(MAX_RESPONSE_CHARS + 10);
    const text = formatRichResponse(result({ content: long }), { mode: "exec" }, "/repo", {
      fullOutputPath: "/tmp/full.md",
    });
    expect(text).toContain("10 characters omitted. Full output: /tmp/full.md]");
  });
});

describe("saveFullOutput", () => {
  const created: string[] = [];

  afterEach(() => {
    for (const f of created.splice(0)) fs.rmSync(f, { force: true });
  });

  it("does nothing when the content fits", () => {
    expect(saveFullOutput("short", undefined, 100)).toBeNull();
  });

  it("writes the full content next to the live log", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-full-"));
    const saved = saveFullOutput("abcdef", path.join(dir, "run.log"), 3);
    expect(saved).not.toBeNull();
    created.push(saved as string);
    expect(path.dirname(saved as string)).toBe(dir);
    expect(fs.readFileSync(saved as string, "utf-8")).toBe("abcdef");
  });

  it("falls back to the OS temp dir and returns null when the write fails", () => {
    const saved = saveFullOutput("abcdef", undefined, 3);
    created.push(saved as string);
    expect(path.dirname(saved as string)).toBe(os.tmpdir());
    expect(saveFullOutput("abcdef", path.join(os.tmpdir(), "no-such-dir-sc", "x", "run.log"), 3)).toBeNull();
  });
});
