import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/codex/cli.js", () => ({ runCodexCommand: vi.fn() }));

import { runCodexCommand } from "../../src/codex/cli.js";
import { decideStatus, runDriftCheck, schemaUrl } from "../../src/codex/drift.js";

const mockRun = vi.mocked(runCodexCommand);

const FULL_HELP = `Options:
  -c, --config <key=value>
  -m, --model <MODEL>
  -s, --sandbox <SANDBOX_MODE>
      --skip-git-repo-check
      --ephemeral
      --add-dir <DIR>
      --output-schema <FILE>
      --json
      --uncommitted
      --base <BRANCH>
      --commit <SHA>
`;

const SCHEMA = `
pub enum ThreadEvent {
    #[serde(rename = "thread.started")]
    ThreadStarted(A),
    #[serde(rename = "turn.started")]
    TurnStarted(A),
    #[serde(rename = "turn.completed")]
    TurnCompleted(A),
    #[serde(rename = "turn.failed")]
    TurnFailed(A),
    #[serde(rename = "item.started")]
    ItemStarted(A),
    #[serde(rename = "item.completed")]
    ItemCompleted(A),
}

pub enum ThreadItemDetails {
    AgentMessage(A),
    Reasoning(A),
    CommandExecution(A),
    FileChange(A),
    McpToolCall(A),
    WebSearch(A),
    TodoList(A),
}
`;

function stubCodex(version: string, help: string = FULL_HELP): void {
  mockRun.mockImplementation(async (args) =>
    args[0] === "--version"
      ? { ok: true, stdout: `codex-cli ${version}`, stderr: "" }
      : { ok: true, stdout: help, stderr: "" },
  );
}

describe("decideStatus", () => {
  const ok = { ok: true, missingFlags: [], missingEvents: [], missingItems: [], unhandledItems: [] };

  it("is drift when the contract is broken, whatever the version", () => {
    expect(decideStatus({ ...ok, ok: false, missingFlags: ["exec: --json"] }, "0.163.0", "0.163.0")).toBe("drift");
  });

  it("is outdated for a new minor version and ok otherwise", () => {
    expect(decideStatus(ok, "0.170.0", "0.163.0")).toBe("outdated");
    expect(decideStatus(ok, "0.163.4", "0.163.0")).toBe("ok");
  });
});

describe("runDriftCheck", () => {
  beforeEach(() => {
    mockRun.mockReset();
  });

  it("fetches the schema for the installed version and reports ok", async () => {
    stubCodex("0.163.0");
    const fetchText = vi.fn().mockResolvedValue(SCHEMA);
    const report = await runDriftCheck(fetchText);
    expect(fetchText).toHaveBeenCalledWith(schemaUrl("0.163.0"));
    expect(report.status).toBe("ok");
    expect(report.version).toBe("0.163.0");
  });

  it("reports outdated with a re-verify hint", async () => {
    stubCodex("0.170.0");
    const report = await runDriftCheck(vi.fn().mockResolvedValue(SCHEMA));
    expect(report.status).toBe("outdated");
    expect(report.markdown).toContain("bump VERIFIED_CODEX_VERSION");
  });

  it("reports drift when a flag disappears", async () => {
    stubCodex("0.170.0", FULL_HELP.replace("      --ephemeral\n", ""));
    const report = await runDriftCheck(vi.fn().mockResolvedValue(SCHEMA));
    expect(report.status).toBe("drift");
    expect(report.markdown).toContain("exec: --ephemeral");
  });

  it("throws when codex can't report a version", async () => {
    mockRun.mockResolvedValue({ ok: false, stdout: "", stderr: "codex: not found" });
    await expect(runDriftCheck(vi.fn())).rejects.toThrow("codex: not found");
  });
});
