import { describe, it, expect } from "vitest";
import { formatProgressMessage } from "../../src/runner/progress.js";

describe("formatProgressMessage", () => {
  it("reports a running command", () => {
    const evt = {
      type: "item.started",
      item: { type: "command_execution", command: "git status", status: "in_progress" },
    };
    expect(formatProgressMessage(evt)).toBe("running: git status");
  });

  it("reports a completed command", () => {
    const evt = {
      type: "item.completed",
      item: { type: "command_execution", command: "git status", status: "completed", exit_code: 0 },
    };
    expect(formatProgressMessage(evt)).toBe("ran: git status");
  });

  it("reports a failed command with exit code", () => {
    const evt = {
      item: { type: "command_execution", command: "npm test", status: "completed", exit_code: 1 },
    };
    expect(formatProgressMessage(evt)).toBe("failed (exit 1): npm test");
  });

  it("reports a blocked command", () => {
    const evt = {
      item: { type: "command_execution", command: "rm -rf /", status: "declined" },
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

  it("reports file reads by basename", () => {
    const evt = { item: { type: "file_read", path: "src/runner/exec-runner.ts" } };
    expect(formatProgressMessage(evt)).toBe("reading exec-runner.ts");
  });

  it("reports a single file_change by basename", () => {
    const evt = { item: { type: "file_change", changes: [{ path: "a/b/c.ts", kind: "modify" }] } };
    expect(formatProgressMessage(evt)).toBe("editing c.ts");
  });

  it("summarizes multi-file changes", () => {
    const evt = {
      item: { type: "file_change", changes: [{ path: "a.ts" }, { path: "b.ts" }, { path: "c.ts" }] },
    };
    expect(formatProgressMessage(evt)).toBe("editing 3 files");
  });

  it("maps turn.started to thinking", () => {
    expect(formatProgressMessage({ type: "turn.started" })).toBe("thinking…");
  });

  it("reports the final agent message as writing response", () => {
    const evt = { type: "item.completed", item: { type: "agent_message", text: "Done." } };
    expect(formatProgressMessage(evt)).toBe("writing response…");
  });

  it("skips partial agent_message streams", () => {
    const evt = { type: "item.started", item: { type: "agent_message", text: "partial" } };
    expect(formatProgressMessage(evt)).toBeNull();
  });

  it("returns null for unknown or malformed events", () => {
    expect(formatProgressMessage({ type: "turn.completed", usage: {} })).toBeNull();
    expect(formatProgressMessage(null)).toBeNull();
    expect(formatProgressMessage("nope")).toBeNull();
    expect(formatProgressMessage({})).toBeNull();
  });
});
