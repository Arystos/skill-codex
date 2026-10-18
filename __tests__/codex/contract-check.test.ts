import { describe, it, expect } from "vitest";
import {
  parseHelpFlags,
  extractEnumTags,
  checkContract,
  formatContractReport,
} from "../../src/codex/contract-check.js";

const EXEC_HELP = `Run Codex non-interactively

Options:
  -c, --config <key=value>
          Override a configuration value
  -m, --model <MODEL>
          Model the agent should use
  -s, --sandbox <SANDBOX_MODE>
      --skip-git-repo-check
      --ephemeral
      --json
          Print events to stdout as JSONL
`;

const SCHEMA = `
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(tag = "type")]
pub enum ThreadEvent {
    /// Emitted when a new thread is started.
    #[serde(rename = "thread.started")]
    ThreadStarted(ThreadStartedEvent),
    #[serde(rename = "turn.completed")]
    TurnCompleted(TurnCompletedEvent),
    #[serde(rename = "error")]
    Error(ThreadErrorEvent),
}

#[serde(tag = "type", rename_all = "snake_case")]
pub enum ThreadItemDetails {
    /// Response from the agent.
    AgentMessage(AgentMessageItem),
    CommandExecution(CommandExecutionItem),
    #[serde(rename = "web_search_v2")]
    WebSearch(WebSearchItem),
    CollabToolCall(CollabToolCallItem),
}

pub struct AgentMessageItem {
    pub text: String,
}
`;

describe("parseHelpFlags", () => {
  it("collects long and short flags from clap help output", () => {
    const flags = parseHelpFlags(EXEC_HELP);
    for (const f of ["--config", "-c", "--model", "-m", "--sandbox", "--skip-git-repo-check", "--ephemeral", "--json"]) {
      expect(flags.has(f)).toBe(true);
    }
    expect(flags.has("--key")).toBe(false);
  });
});

describe("extractEnumTags", () => {
  it("reads serde renames for events", () => {
    expect(extractEnumTags(SCHEMA, "ThreadEvent")).toEqual(["thread.started", "turn.completed", "error"]);
  });

  it("snake_cases item variants and honours explicit renames", () => {
    expect(extractEnumTags(SCHEMA, "ThreadItemDetails")).toEqual([
      "agent_message",
      "command_execution",
      "web_search_v2",
      "collab_tool_call",
    ]);
  });

  it("returns [] when the enum is missing", () => {
    expect(extractEnumTags(SCHEMA, "Nope")).toEqual([]);
  });
});

describe("checkContract", () => {
  const required = {
    flags: { exec: ["--json", "--model", "--output-last-message"] },
    events: ["thread.started", "turn.failed"],
    items: ["agent_message", "web_search"],
  };

  it("reports missing flags, events and items, plus schema items we don't handle", () => {
    const result = checkContract({ help: { exec: EXEC_HELP }, schemaSource: SCHEMA }, required);
    expect(result.ok).toBe(false);
    expect(result.missingFlags).toEqual(["exec: --output-last-message"]);
    expect(result.missingEvents).toEqual(["turn.failed"]);
    expect(result.missingItems).toEqual(["web_search"]);
    expect(result.unhandledItems).toEqual(["command_execution", "web_search_v2", "collab_tool_call"]);
  });

  it("treats a subcommand with no help text as all flags missing", () => {
    const result = checkContract({ help: {}, schemaSource: SCHEMA }, required);
    expect(result.missingFlags).toEqual(["exec: --json", "exec: --model", "exec: --output-last-message"]);
  });

  it("is ok when everything is present", () => {
    const result = checkContract(
      { help: { exec: EXEC_HELP }, schemaSource: SCHEMA },
      { flags: { exec: ["--json"] }, events: ["error"], items: ["agent_message"] },
    );
    expect(result.ok).toBe(true);
  });
});

describe("formatContractReport", () => {
  it("renders a markdown report", () => {
    const result = checkContract(
      { help: { exec: EXEC_HELP }, schemaSource: SCHEMA },
      { flags: { exec: ["--nope"] }, events: [], items: ["agent_message"] },
    );
    const report = formatContractReport(result, "0.170.0");
    expect(report).toContain("codex-cli 0.170.0");
    expect(report).toContain("- exec: --nope");
    expect(report).toContain("collab_tool_call");
  });

  it("says so when the contract holds", () => {
    const result = checkContract(
      { help: { exec: EXEC_HELP }, schemaSource: SCHEMA },
      { flags: { exec: ["--json"] }, events: [], items: [] },
    );
    expect(formatContractReport(result, "0.170.0")).toContain("All flags and event types skill-codex relies on are present");
  });
});
