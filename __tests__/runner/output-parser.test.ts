import { describe, it, expect } from "vitest";
import { parseCodexOutput } from "../../src/runner/output-parser.js";
import { EmptyOutputError } from "../../src/errors/errors.js";

describe("parseCodexOutput", () => {
  it("throws EmptyOutputError on empty string", () => {
    expect(() => parseCodexOutput("")).toThrow(EmptyOutputError);
  });

  it("throws EmptyOutputError on whitespace-only", () => {
    expect(() => parseCodexOutput("  \n  \n  ")).toThrow(EmptyOutputError);
  });

  it("parses standard message type", () => {
    const jsonl = '{"type":"message","content":"Hello from Codex"}';
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("Hello from Codex");
  });

  it("parses nested item format", () => {
    const jsonl = '{"item":{"type":"agent_message","text":"Review complete"}}';
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("Review complete");
  });

  it("parses flat legacy format", () => {
    const jsonl = '{"itemType":"agent_message","text":"Legacy output"}';
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("Legacy output");
  });

  it("parses result type", () => {
    const jsonl = '{"type":"result","content":"Final result"}';
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("Final result");
  });

  it("captures session id from thread.started", () => {
    const jsonl = [
      '{"type":"thread.started","thread_id":"abc-123"}',
      '{"type":"result","content":"Final result"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.sessionId).toBe("abc-123");
  });

  it("accumulates when multiple messages exist", () => {
    const jsonl = [
      '{"type":"message","content":"First"}',
      '{"type":"message","content":"Second"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toContain("First");
    expect(result.content).toContain("Second");
  });

  it("accumulates multiple messages", () => {
    const jsonl = [
      '{"type":"message","content":"Alpha"}',
      '{"type":"message","content":"Beta"}',
      '{"type":"message","content":"Gamma"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toContain("Alpha");
    expect(result.content).toContain("Beta");
    expect(result.content).toContain("Gamma");
  });

  it("prefers result type over accumulated messages", () => {
    const jsonl = [
      '{"type":"message","content":"Intermediate step"}',
      '{"type":"message","content":"Another step"}',
      '{"type":"result","content":"Final result"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("Final result");
    expect(result.content).not.toContain("Intermediate step");
    expect(result.content).not.toContain("Another step");
  });

  it("skips non-JSON lines gracefully", () => {
    const jsonl = [
      "OpenAI Codex v0.115.0 (research preview)",
      "--------",
      '{"type":"message","content":"Actual output"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("Actual output");
  });

  it("falls back to raw text when no structured output", () => {
    const raw = "Some plain text output\nWith multiple lines";
    const result = parseCodexOutput(raw);
    expect(result.content).toContain("Some plain text output");
  });

  it("preserves raw output", () => {
    const jsonl = '{"type":"message","content":"Hello"}';
    const result = parseCodexOutput(jsonl);
    expect(result.raw).toBe(jsonl);
  });

  it("captures reasoning_output_tokens from turn.completed usage", () => {
    const jsonl = [
      '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":20,"reasoning_output_tokens":15}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.usage).toEqual({
      input_tokens: 100,
      cached_input_tokens: 40,
      output_tokens: 20,
      reasoning_output_tokens: 15,
    });
  });

  it("defaults reasoning_output_tokens to 0 when absent", () => {
    const jsonl = [
      '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.usage?.reasoning_output_tokens).toBe(0);
  });

  it("records file_change activity from a top-level path", () => {
    const jsonl = [
      '{"type":"item.completed","item":{"type":"file_change","path":"src/foo.ts"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"edited"}}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.activity).toContainEqual(
      expect.objectContaining({ type: "write", path: "src/foo.ts" }),
    );
  });

  it("records file_change activity from a changes array", () => {
    const jsonl =
      '{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"a.ts","kind":"modified"},{"path":"b.ts","kind":"added"}]}}\n' +
      '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}';
    const result = parseCodexOutput(jsonl);
    const writes = result.activity.filter((a) => a.type === "write");
    expect(writes).toHaveLength(2);
    expect(writes.map((w) => w.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("ignores agent_message text on item.started/item.updated partials", () => {
    const jsonl = [
      '{"type":"item.started","item":{"type":"agent_message","text":"partial"}}',
      '{"type":"item.updated","item":{"type":"agent_message","text":"partial more"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"final answer"}}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("final answer");
    expect(result.content).not.toContain("partial");
  });
});
