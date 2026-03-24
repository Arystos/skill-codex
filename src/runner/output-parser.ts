import { EmptyOutputError } from "../errors/errors.js";
import { truncateResponse } from "../util/truncate.js";

export interface CodexResult {
  readonly content: string;
  readonly raw: string;
}

export function parseCodexOutput(raw: string): CodexResult {
  if (!raw.trim()) {
    throw new EmptyOutputError();
  }

  const lines = raw.split("\n").filter((line) => line.trim());
  let agentMessage = "";

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // Handle standard event format
      if (parsed.type === "message" && typeof parsed.content === "string") {
        agentMessage = parsed.content;
        continue;
      }

      // Handle nested item format (Codex JSONL)
      if (parsed.item?.type === "agent_message" && typeof parsed.item.text === "string") {
        agentMessage = parsed.item.text;
        continue;
      }

      // Handle flat legacy format
      if (parsed.itemType === "agent_message" && typeof parsed.text === "string") {
        agentMessage = parsed.text;
        continue;
      }

      // Handle result type
      if (parsed.type === "result" && typeof parsed.content === "string") {
        agentMessage = parsed.content;
        continue;
      }
    } catch {
      // Non-JSON line — could be preamble or status output. Skip.
    }
  }

  // If no structured output found, use the raw text (minus any obvious preamble)
  if (!agentMessage) {
    // Try to extract the last substantial block of text
    const substantiveLines = lines.filter(
      (line) => !line.startsWith("OpenAI Codex") && !line.startsWith("---") && !line.startsWith("tokens used"),
    );
    agentMessage = substantiveLines.join("\n").trim();
  }

  if (!agentMessage) {
    throw new EmptyOutputError();
  }

  return {
    content: truncateResponse(agentMessage),
    raw,
  };
}
