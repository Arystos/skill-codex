import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatActivity,
  formatError,
  formatRichResponse,
  formatStructuredOutput,
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
  const usage = {
    input_tokens: 16626,
    cached_input_tokens: 11264,
    cache_write_input_tokens: 512,
    output_tokens: 5,
    reasoning_output_tokens: 0,
  };

  it("shows cache write input tokens in the header when greater than 0", () => {
    const text = formatRichResponse(result({ usage }), { mode: "exec" }, "/repo");
    expect(text.split("\n")[0]).toContain("16626 tok in (11264 cached) (512 cache write) → 5 out");
  });

  it("does not show cache write input tokens in the header when 0", () => {
    const text = formatRichResponse(result({ usage: { ...usage, cache_write_input_tokens: 0 } }), { mode: "exec" }, "/repo");
    expect(text.split("\n")[0]).not.toContain("cache write");
  });

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

describe("add-dir header line", () => {
  it("lists the extra writable roots when addDirs were passed", () => {
    const text = formatRichResponse(result(), { mode: "full-auto", addDirs: ["/repo/lib", "/repo/shared"] }, "/repo/app");
    expect(text).toContain("  add-dir (writable): /repo/lib, /repo/shared");
  });

  it("omits the line without addDirs", () => {
    expect(formatRichResponse(result(), { mode: "full-auto", addDirs: [] }, "/repo")).not.toContain("add-dir");
  });
});

describe("structured output (outputSchema)", () => {
  const schema = { type: "object" };

  it("shows the final message as a pretty JSON block with a status line", () => {
    const final = '{"findings":[{"severity":"high","file":"a.ts","line":3}]}';
    const text = formatRichResponse(result({ content: final, finalMessage: final }), { mode: "exec", outputSchema: schema }, "/repo");

    expect(text).toContain("  structured output: JSON constrained by outputSchema (final message, below)");
    expect(text).toContain('```json\n{\n  "findings": [');
    expect(text.trimEnd().endsWith("```")).toBe(true);
  });

  it("keeps earlier prose messages above the JSON block", () => {
    const final = '{"ok":true}';
    const { body } = formatStructuredOutput(result({ content: `Checked the diff.\n\n${final}`, finalMessage: final }));
    expect(body).toBe('Checked the diff.\n\n```json\n{\n  "ok": true\n}\n```');
  });

  it("falls back to the raw text and says so when the final message is not JSON", () => {
    const out = formatStructuredOutput(result({ content: "not json", finalMessage: "not json" }));
    expect(out.status).toContain("not valid JSON");
    expect(out.body).toBe("not json");
    expect(formatStructuredOutput(result({ content: "plain" })).body).toBe("plain");
  });

  it("leaves responses without outputSchema unchanged", () => {
    const text = formatRichResponse(result({ content: '{"a":1}', finalMessage: '{"a":1}' }), { mode: "exec" }, "/repo");
    expect(text).not.toContain("structured output");
    expect(text.endsWith('{"a":1}')).toBe(true);
  });
});
