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
  const messages: string[] = [];
  let resultContent: string | null = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // Handle result type — takes priority over all other messages
      if (parsed.type === "result" && typeof parsed.content === "string") {
        resultContent = parsed.content;
        continue;
      }

      // Handle standard event format
      if (parsed.type === "message" && typeof parsed.content === "string") {
        messages.push(parsed.content);
        continue;
      }

      // Handle nested item format (Codex JSONL)
      if (parsed.item?.type === "agent_message" && typeof parsed.item.text === "string") {
        messages.push(parsed.item.text);
        continue;
      }

      // Handle flat legacy format
      if (parsed.itemType === "agent_message" && typeof parsed.text === "string") {
        messages.push(parsed.text);
        continue;
      }
    } catch {
      // Non-JSON line — could be preamble or status output. Skip.
    }
  }

  let agentMessage: string;

  if (resultContent !== null) {
    agentMessage = resultContent;
  } else if (messages.length > 0) {
    agentMessage = messages.join("\n\n");
  } else {
    // If no structured output found, use the raw text (minus any obvious preamble)
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
