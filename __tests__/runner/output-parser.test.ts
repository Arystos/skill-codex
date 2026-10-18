import { describe, it, expect } from "vitest";
import {
  parseCodexOutput,
  extractTurnFailure,
  isFinalAgentMessage,
  NO_FINAL_MESSAGE,
} from "../../src/runner/output-parser.js";
import { EmptyOutputError } from "../../src/errors/errors.js";

// Fixtures mirror `codex exec --json` events from codex-rs/exec/src/exec_events.rs
// (Codex CLI 0.163.0). Items carry an `id` plus a snake_case `type` tag.
const jsonl = (...events: unknown[]): string => events.map((e) => JSON.stringify(e)).join("\n");

const threadStarted = { type: "thread.started", thread_id: "0199a213-81c0-7800-8aa1-bbab2a035a53" };
const turnStarted = { type: "turn.started" };
const turnCompleted = {
  type: "turn.completed",
  usage: {
    input_tokens: 24763,
    cached_input_tokens: 24448,
    cache_write_input_tokens: 0,
    output_tokens: 122,
    reasoning_output_tokens: 64,
  },
};
const agentMessage = (text: string, id = "item_3") => ({
  type: "item.completed",
  item: { id, type: "agent_message", text },
});
const reconnectError = {
  type: "error",
  message: "Reconnecting... 2/5 (workspace routing discovery unauthorized (401))",
};
const fallbackErrorItem = {
  type: "item.completed",
  item: {
    id: "item_0",
    type: "error",
    message: "Falling back from WebSockets to HTTPS transport. stream disconnected before completion",
  },
};
const turnFailed = {
  type: "turn.failed",
  error: { message: "workspace routing discovery unauthorized (401)" },
};

describe("parseCodexOutput", () => {
  it("throws EmptyOutputError on empty string", () => {
    expect(() => parseCodexOutput("")).toThrow(EmptyOutputError);
  });

  it("throws EmptyOutputError on whitespace-only", () => {
    expect(() => parseCodexOutput("  \n  \n  ")).toThrow(EmptyOutputError);
  });

  it("parses a full successful run", () => {
    const raw = jsonl(
      threadStarted,
      turnStarted,
      { type: "item.completed", item: { id: "item_0", type: "reasoning", text: "**Checking the repo**" } },
      agentMessage("Review complete"),
      turnCompleted,
    );
    const result = parseCodexOutput(raw);
    expect(result.content).toBe("Review complete");
    expect(result.sessionId).toBe("0199a213-81c0-7800-8aa1-bbab2a035a53");
    expect(result.activity).toEqual([]);
  });

  it("joins multiple completed agent messages", () => {
    const raw = jsonl(agentMessage("Alpha", "item_1"), agentMessage("Beta", "item_2"));
    expect(parseCodexOutput(raw).content).toBe("Alpha\n\nBeta");
  });

  it("keeps the last agent message alone as finalMessage (the one --output-schema constrains)", () => {
    const raw = jsonl(agentMessage("Looking at the diff.", "item_1"), agentMessage('{"findings":[]}', "item_2"));
    expect(parseCodexOutput(raw).finalMessage).toBe('{"findings":[]}');
  });

  it("has no finalMessage when the output had no agent message", () => {
    expect(parseCodexOutput("plain text only").finalMessage).toBeUndefined();
  });

  it("ignores agent_message text on item.started/item.updated partials", () => {
    const raw = jsonl(
      { type: "item.started", item: { id: "item_1", type: "agent_message", text: "partial" } },
      { type: "item.updated", item: { id: "item_1", type: "agent_message", text: "partial more" } },
      agentMessage("final answer", "item_1"),
    );
    const result = parseCodexOutput(raw);
    expect(result.content).toBe("final answer");
    expect(result.content).not.toContain("partial");
  });

  it("does not treat legacy result/message events as agent output", () => {
    const raw = jsonl(
      { type: "message", content: "stale" },
      { type: "result", content: "stale" },
      agentMessage("real answer"),
    );
    expect(parseCodexOutput(raw).content).toBe("real answer");
  });

  it("recovers from transient error events and error items", () => {
    const raw = jsonl(
      threadStarted,
      turnStarted,
      reconnectError,
      fallbackErrorItem,
      agentMessage("Recovered and done"),
      turnCompleted,
    );
    const result = parseCodexOutput(raw);
    expect(result.content).toBe("Recovered and done");
    expect(result.usage?.output_tokens).toBe(122);
  });

  it("skips non-JSON lines gracefully", () => {
    const raw = ["OpenAI Codex v0.163.0 (research preview)", "--------", jsonl(agentMessage("Actual output"))].join(
      "\n",
    );
    expect(parseCodexOutput(raw).content).toBe("Actual output");
  });

  it("skips JSON lines that are not objects", () => {
    const raw = ["null", "42", jsonl(agentMessage("Actual output"))].join("\n");
    expect(parseCodexOutput(raw).content).toBe("Actual output");
  });

  it("falls back to raw text when no structured output", () => {
    const raw = "Some plain text output\nWith multiple lines";
    expect(parseCodexOutput(raw).content).toContain("Some plain text output");
  });

  it("drops the Codex banner and token footer in the raw-text fallback", () => {
    const raw = ["OpenAI Codex v0.163.0", "--------", "plain answer", "tokens used: 12"].join("\n");
    expect(parseCodexOutput(raw).content).toBe("plain answer");
  });

  it("throws EmptyOutputError when only preamble remains", () => {
    expect(() => parseCodexOutput("OpenAI Codex v0.163.0\n--------")).toThrow(EmptyOutputError);
  });

  describe("a finished run without a final message (#59)", () => {
    const fileChange = {
      type: "item.completed",
      item: { id: "item_1", type: "file_change", status: "completed", changes: [{ path: "hello.txt", kind: "add" }] },
    };

    it("returns a result instead of a retryable EmptyOutputError when Codex wrote files", () => {
      const result = parseCodexOutput(jsonl(threadStarted, turnStarted, fileChange, agentMessage(""), turnCompleted));
      expect(result.content).toBe(NO_FINAL_MESSAGE);
      expect(result.activity).toEqual([{ type: "write", path: "hello.txt", icon: "✎", status: "add" }]);
      expect(result.finalMessage).toBeUndefined();
      expect(result.sessionId).toBe(threadStarted.thread_id);
    });

    it("treats a completed turn with no message and no actions as finished, not empty", () => {
      expect(parseCodexOutput(jsonl(threadStarted, turnStarted, turnCompleted)).content).toBe(NO_FINAL_MESSAGE);
    });

    it("counts actions even when the turn.completed event is missing", () => {
      expect(parseCodexOutput(jsonl(threadStarted, fileChange)).content).toBe(NO_FINAL_MESSAGE);
    });

    it("drops empty agent messages and keeps the real ones", () => {
      const result = parseCodexOutput(jsonl(agentMessage("Done.", "item_1"), agentMessage("  ", "item_2"), turnCompleted));
      expect(result.content).toBe("Done.");
      expect(result.finalMessage).toBe("Done.");
    });

    it("still throws EmptyOutputError when nothing ran", () => {
      expect(() => parseCodexOutput(jsonl(agentMessage("")))).toThrow(EmptyOutputError);
    });
  });

  it("preserves raw output", () => {
    const raw = jsonl(agentMessage("Hello"));
    expect(parseCodexOutput(raw).raw).toBe(raw);
  });

  it("captures token usage from turn.completed", () => {
    const raw = jsonl(turnCompleted, agentMessage("done"));
    expect(parseCodexOutput(raw).usage).toEqual({
      input_tokens: 24763,
      cached_input_tokens: 24448,
      cache_write_input_tokens: 0,
      output_tokens: 122,
      reasoning_output_tokens: 64,
    });
  });

  it("defaults missing usage fields to 0", () => {
    const raw = jsonl({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } }, agentMessage("done"));
    const usage = parseCodexOutput(raw).usage;
    expect(usage?.cached_input_tokens).toBe(0);
    expect(usage?.cache_write_input_tokens).toBe(0);
    expect(usage?.reasoning_output_tokens).toBe(0);
  });

  it("parses cache write input tokens from turn.completed", () => {
    const raw = jsonl(
      { type: "turn.completed", usage: { input_tokens: 16626, cached_input_tokens: 11264, cache_write_input_tokens: 512, output_tokens: 5 } },
      agentMessage("done"),
    );
    expect(parseCodexOutput(raw).usage?.cache_write_input_tokens).toBe(512);
  });

  it("returns null usage when the turn never completed", () => {
    expect(parseCodexOutput(jsonl(agentMessage("done"))).usage).toBeNull();
  });

  describe("command_execution activity", () => {
    const command = (fields: Record<string, unknown>) => ({
      type: "item.completed",
      item: { id: "item_1", type: "command_execution", command: "bash -lc 'npm test'", aggregated_output: "", ...fields },
    });

    it("records a successful command", () => {
      const raw = jsonl(command({ exit_code: 0, status: "completed" }), agentMessage("ok"));
      expect(parseCodexOutput(raw).activity).toEqual([
        { type: "exec", command: "bash -lc 'npm test'", icon: "✔", status: "ok" },
      ]);
    });

    it("records a non-zero exit", () => {
      const raw = jsonl(command({ exit_code: 2, status: "failed" }), agentMessage("ok"));
      expect(parseCodexOutput(raw).activity[0]).toMatchObject({ icon: "✘", status: "exit 2" });
    });

    it("records a failed command without an exit code", () => {
      const raw = jsonl(command({ exit_code: null, status: "failed" }), agentMessage("ok"));
      expect(parseCodexOutput(raw).activity[0]).toMatchObject({ icon: "✘", status: "failed" });
    });

    it("records a declined command as blocked", () => {
      const raw = jsonl(command({ exit_code: null, status: "declined" }), agentMessage("ok"));
      expect(parseCodexOutput(raw).activity[0]).toMatchObject({ icon: "✘", status: "blocked" });
    });

    it("skips in_progress starts", () => {
      const raw = jsonl(
        { ...command({ exit_code: null, status: "in_progress" }), type: "item.started" },
        agentMessage("ok"),
      );
      expect(parseCodexOutput(raw).activity).toEqual([]);
    });

    it("truncates long commands", () => {
      const long = "echo " + "x".repeat(200);
      const raw = jsonl(command({ command: long, exit_code: 0, status: "completed" }), agentMessage("ok"));
      const recorded = parseCodexOutput(raw).activity[0].command ?? "";
      expect(recorded).toHaveLength(80);
      expect(recorded.endsWith("...")).toBe(true);
    });
  });

  describe("file_change activity", () => {
    it("records one write per change with its kind", () => {
      const raw = jsonl(
        {
          type: "item.completed",
          item: {
            id: "item_2",
            type: "file_change",
            changes: [
              { path: "src/a.ts", kind: "update" },
              { path: "src/b.ts", kind: "add" },
            ],
            status: "completed",
          },
        },
        agentMessage("ok"),
      );
      expect(parseCodexOutput(raw).activity).toEqual([
        { type: "write", path: "src/a.ts", icon: "✎", status: "update" },
        { type: "write", path: "src/b.ts", icon: "✎", status: "add" },
      ]);
    });

    it("records nothing for an empty changes array", () => {
      const raw = jsonl(
        { type: "item.completed", item: { id: "item_2", type: "file_change", changes: [], status: "completed" } },
        agentMessage("ok"),
      );
      expect(parseCodexOutput(raw).activity).toEqual([]);
    });

    it("ignores removed legacy file_read/file_write/file_edit items", () => {
      const raw = jsonl(
        { type: "item.completed", item: { type: "file_read", path: "a.ts" } },
        { type: "item.completed", item: { type: "file_write", path: "b.ts" } },
        { type: "item.completed", item: { type: "file_edit", path: "c.ts" } },
        agentMessage("ok"),
      );
      expect(parseCodexOutput(raw).activity).toEqual([]);
    });
  });
});

describe("extractTurnFailure", () => {
  it("returns the turn.failed error message", () => {
    const raw = jsonl(threadStarted, turnStarted, reconnectError, fallbackErrorItem, turnFailed);
    expect(extractTurnFailure(raw)).toEqual({ message: "workspace routing discovery unauthorized (401)" });
  });

  it("unwraps a JSON-encoded API error into its inner message, status and type", () => {
    // Captured live from Codex 0.163.0 with an unsupported model.
    const raw = [
      '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata for `gpt-5.6-sol` not found. Defaulting to fallback metadata; this can degrade performance and cause issues."}}',
      '{"type":"error","message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-5.6-sol\' model is not supported when using Codex with a ChatGPT account.\\"}}"}',
      '{"type":"turn.failed","error":{"message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-5.6-sol\' model is not supported when using Codex with a ChatGPT account.\\"}}"}}',
    ].join("\n");
    expect(extractTurnFailure(raw)).toEqual({
      message: "The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account.",
      status: 400,
      errorType: "invalid_request_error",
    });
  });

  it("keeps the raw string when the message is JSON without an inner error message", () => {
    const raw = jsonl({ type: "turn.failed", error: { message: '{"status":500}' } }, {
      type: "turn.failed",
      error: { message: "[1, 2]" },
    });
    expect(extractTurnFailure(raw)).toEqual({ message: "[1, 2]" });
    expect(extractTurnFailure(jsonl({ type: "turn.failed", error: { message: '{"status":500}' } }))).toEqual({
      message: '{"status":500}',
    });
  });

  it("omits a non-numeric status from a JSON-encoded error", () => {
    const encoded = JSON.stringify({ status: "bad", error: { message: "nope" } });
    expect(extractTurnFailure(jsonl({ type: "turn.failed", error: { message: encoded } }))).toEqual({
      message: "nope",
    });
  });

  it("ignores transient error events and error items on their own", () => {
    const raw = jsonl(threadStarted, turnStarted, reconnectError, fallbackErrorItem);
    expect(extractTurnFailure(raw)).toBeNull();
  });

  it("returns the last turn.failed when several are present", () => {
    const raw = jsonl(
      { type: "turn.failed", error: { message: "first" } },
      { type: "turn.failed", error: { message: "second" } },
    );
    expect(extractTurnFailure(raw)).toEqual({ message: "second" });
  });

  it("ignores malformed turn.failed events and non-JSON lines", () => {
    const raw = ["not json", jsonl({ type: "turn.failed" }, { type: "turn.failed", error: { message: 7 } })].join("\n");
    expect(extractTurnFailure(raw)).toBeNull();
  });

  it("returns null for empty output", () => {
    expect(extractTurnFailure("")).toBeNull();
  });
});

describe("isFinalAgentMessage", () => {
  it("accepts a completed agent_message", () => {
    expect(isFinalAgentMessage(agentMessage("done"))).toBe(true);
  });

  it("rejects partials and other items", () => {
    expect(isFinalAgentMessage({ type: "item.updated", item: { type: "agent_message", text: "x" } })).toBe(false);
    expect(isFinalAgentMessage({ type: "item.completed", item: { type: "reasoning", text: "x" } })).toBe(false);
    expect(isFinalAgentMessage({ type: "item.completed", item: { type: "agent_message" } })).toBe(false);
    expect(isFinalAgentMessage(null)).toBe(false);
  });
});
