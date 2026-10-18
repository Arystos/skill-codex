import { describe, it, expect } from "vitest";
import { formatProgressMessage, formatHeartbeat, isPlanStep } from "../../src/runner/progress.js";

describe("formatProgressMessage", () => {
  it("reports a running command", () => {
    const evt = {
      type: "item.started",
      item: { id: "item_1", type: "command_execution", command: "git status", aggregated_output: "", exit_code: null, status: "in_progress" },
    };
    expect(formatProgressMessage(evt)).toBe("running: git status");
  });

  it("reports a completed command", () => {
    const evt = {
      type: "item.completed",
      item: { id: "item_1", type: "command_execution", command: "git status", status: "completed", exit_code: 0 },
    };
    expect(formatProgressMessage(evt)).toBe("ran: git status");
  });

  it("reports a failed command with exit code", () => {
    const evt = {
      item: { type: "command_execution", command: "npm test", status: "failed", exit_code: 1 },
    };
    expect(formatProgressMessage(evt)).toBe("failed (exit 1): npm test");
  });

  it("reports a failed command without an exit code", () => {
    const evt = {
      item: { type: "command_execution", command: "npm test", status: "failed", exit_code: null },
    };
    expect(formatProgressMessage(evt)).toBe("failed: npm test");
  });

  it("reports a blocked command", () => {
    const evt = {
      item: { type: "command_execution", command: "rm -rf /", status: "declined", exit_code: null },
    };
    expect(formatProgressMessage(evt)).toBe("blocked: rm -rf /");
  });

  it("collapses and truncates long commands", () => {
    const long = "echo " + "x".repeat(200);
    const out = formatProgressMessage({
      item: { type: "command_execution", command: long, status: "in_progress" },
    });
    expect(out?.startsWith("running: echo ")).toBe(true);
    expect(out!.length).toBeLessThanOrEqual("running: ".length + 60);
  });

  it("reports a single file_change by basename", () => {
    const evt = {
      item: { type: "file_change", changes: [{ path: "a/b/c.ts", kind: "update" }], status: "completed" },
    };
    expect(formatProgressMessage(evt)).toBe("editing c.ts");
  });

  it("summarizes multi-file changes", () => {
    const evt = {
      item: {
        type: "file_change",
        changes: [
          { path: "a.ts", kind: "update" },
          { path: "b.ts", kind: "add" },
          { path: "c.ts", kind: "delete" },
        ],
        status: "completed",
      },
    };
    expect(formatProgressMessage(evt)).toBe("editing 3 files");
  });

  it("returns null for a file_change without changes", () => {
    expect(formatProgressMessage({ item: { type: "file_change", changes: [], status: "completed" } })).toBeNull();
  });

  it("ignores removed legacy file_read/file_write/file_edit items", () => {
    expect(formatProgressMessage({ item: { type: "file_read", path: "a.ts" } })).toBeNull();
    expect(formatProgressMessage({ item: { type: "file_write", path: "a.ts" } })).toBeNull();
    expect(formatProgressMessage({ item: { type: "file_edit", path: "a.ts" } })).toBeNull();
  });

  describe("web_search", () => {
    const search = (type: string, fields: Record<string, unknown>) => ({
      type,
      item: { id: "item_4", type: "web_search", query: "", action: { type: "other" }, ...fields },
    });

    it("reports a started search with its query", () => {
      const evt = search("item.started", { query: "vitest coverage thresholds" });
      expect(formatProgressMessage(evt)).toBe("searching web: vitest coverage thresholds");
    });

    it("reports a completed search with its query", () => {
      const evt = search("item.completed", {
        query: "vitest coverage thresholds",
        action: { type: "search", query: "vitest coverage thresholds" },
      });
      expect(formatProgressMessage(evt)).toBe("searched web: vitest coverage thresholds");
    });

    it("falls back to the action query or url when query is empty", () => {
      expect(formatProgressMessage(search("item.started", { action: { type: "search", query: "node 22" } }))).toBe(
        "searching web: node 22",
      );
      expect(
        formatProgressMessage(search("item.started", { action: { type: "open_page", url: "https://vitest.dev" } })),
      ).toBe("searching web: https://vitest.dev");
    });

    it("reports a search without any target", () => {
      expect(formatProgressMessage(search("item.started", {}))).toBe("searching web…");
    });

    it("truncates long queries", () => {
      const out = formatProgressMessage(search("item.started", { query: "q".repeat(200) }));
      expect(out!.length).toBeLessThanOrEqual("searching web: ".length + 60);
    });
  });

  describe("mcp_tool_call", () => {
    const call = (status: string) => ({
      type: status === "in_progress" ? "item.started" : "item.completed",
      item: {
        id: "item_5",
        type: "mcp_tool_call",
        server: "github",
        tool: "search_code",
        arguments: { q: "parseCodexOutput" },
        result: null,
        error: status === "failed" ? { message: "boom" } : null,
        status,
      },
    });

    it("reports an in-progress call as server/tool", () => {
      expect(formatProgressMessage(call("in_progress"))).toBe("calling: github/search_code");
    });

    it("reports a completed call", () => {
      expect(formatProgressMessage(call("completed"))).toBe("called: github/search_code");
    });

    it("reports a failed call", () => {
      expect(formatProgressMessage(call("failed"))).toBe("failed: github/search_code");
    });
  });

  describe("todo_list", () => {
    const todo = (type: string, items: Array<{ text: string; completed: boolean }>) => ({
      type,
      item: { id: "item_6", type: "todo_list", items },
    });

    it("reports progress and the next open step", () => {
      const evt = todo("item.updated", [
        { text: "Read the parser", completed: true },
        { text: "Write failing tests", completed: false },
        { text: "Implement", completed: false },
      ]);
      expect(formatProgressMessage(evt)).toBe("plan 1/3: Write failing tests");
    });

    it("reports a fully completed plan", () => {
      const evt = todo("item.completed", [
        { text: "Read the parser", completed: true },
        { text: "Implement", completed: true },
      ]);
      expect(formatProgressMessage(evt)).toBe("plan 2/2 done");
    });

    it("returns null for an empty plan", () => {
      expect(formatProgressMessage(todo("item.started", []))).toBeNull();
    });
  });

  it("maps reasoning items and turn.started to thinking", () => {
    expect(formatProgressMessage({ type: "turn.started" })).toBe("thinking…");
    expect(formatProgressMessage({ type: "item.completed", item: { type: "reasoning", text: "**Plan**" } })).toBe(
      "thinking…",
    );
  });

  it("reports the final agent message as writing response", () => {
    const evt = { type: "item.completed", item: { id: "item_3", type: "agent_message", text: "Done." } };
    expect(formatProgressMessage(evt)).toBe("writing response…");
  });

  it("skips partial agent_message streams", () => {
    const evt = { type: "item.started", item: { type: "agent_message", text: "partial" } };
    expect(formatProgressMessage(evt)).toBeNull();
  });

  it("returns null for unknown or malformed events", () => {
    expect(formatProgressMessage({ type: "turn.completed", usage: {} })).toBeNull();
    expect(formatProgressMessage({ type: "error", message: "Reconnecting... 1/5" })).toBeNull();
    expect(formatProgressMessage(null)).toBeNull();
    expect(formatProgressMessage("nope")).toBeNull();
    expect(formatProgressMessage({})).toBeNull();
  });
});

describe("formatHeartbeat", () => {
  it("shows a bare timer when nothing has happened yet", () => {
    expect(formatHeartbeat(12_400, null, null)).toBe("Codex working… 12s");
  });

  it("switches to minutes after a minute", () => {
    expect(formatHeartbeat(130_000, null, null)).toBe("Codex working… 2m 10s");
  });

  it("prefers the plan step over the last action", () => {
    expect(formatHeartbeat(65_000, "plan 2/5: write tests", "ran: npm test")).toBe(
      "Codex working… 1m 05s · plan 2/5: write tests",
    );
    expect(formatHeartbeat(5_000, null, "ran: npm test")).toBe("Codex working… 5s · ran: npm test");
  });
});

describe("isPlanStep", () => {
  it("recognises todo_list progress lines", () => {
    expect(isPlanStep("plan 1/3: do it")).toBe(true);
    expect(isPlanStep("plan 2/2 done")).toBe(true);
    expect(isPlanStep("ran: plan")).toBe(false);
  });
});
