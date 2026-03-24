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

  it("uses last message when multiple exist", () => {
    const jsonl = [
      '{"type":"message","content":"First"}',
      '{"type":"message","content":"Second"}',
    ].join("\n");
    const result = parseCodexOutput(jsonl);
    expect(result.content).toBe("Second");
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
});
