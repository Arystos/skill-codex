import fs from "node:fs";
import which from "which";
import { getGlobalMcpConfigPath, getGlobalCommandsDir } from "../src/config/paths.js";

interface CheckResult {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export async function runVerification(): Promise<{
  results: CheckResult[];
  allPassed: boolean;
}> {
  const results: CheckResult[] = [];

  // 1. Node.js version
  const nodeVersion = process.versions.node;
  const nodeMajor = parseInt(nodeVersion.split(".")[0] ?? "0", 10);
  results.push({
    name: "Node.js >= 18",
    pass: nodeMajor >= 18,
    detail: `v${nodeVersion}`,
  });

  // 2. Codex CLI on PATH
  let codexPath: string | null = null;
  try {
    codexPath = await which("codex");
    results.push({ name: "Codex CLI found", pass: true, detail: codexPath });
  } catch {
    results.push({ name: "Codex CLI found", pass: false, detail: "Not found. Run: npm i -g @openai/codex" });
  }

  // 3. MCP server registered
  const mcpPath = getGlobalMcpConfigPath();
  let mcpRegistered = false;
  if (fs.existsSync(mcpPath)) {
    try {
      const raw = fs.readFileSync(mcpPath, "utf-8");
      const config = JSON.parse(raw);
      mcpRegistered = "codex-bridge" in (config.mcpServers ?? {});
    } catch {
      // Parse error
    }
  }
  results.push({
    name: "MCP server registered",
    pass: mcpRegistered,
    detail: mcpRegistered ? mcpPath : `Not found in ${mcpPath}`,
  });

  // 4. Slash commands installed
  const commandsDir = getGlobalCommandsDir();
  const expectedCommands = ["codex-review.md", "codex-do.md", "codex-consult.md"];
  const missingCommands = expectedCommands.filter(
    (cmd) => !fs.existsSync(`${commandsDir}/${cmd}`),
  );
  results.push({
    name: "Slash commands installed",
    pass: missingCommands.length === 0,
    detail: missingCommands.length === 0
      ? `All 3 commands in ${commandsDir}`
      : `Missing: ${missingCommands.join(", ")}`,
  });

  return {
    results,
    allPassed: results.every((r) => r.pass),
  };
}
