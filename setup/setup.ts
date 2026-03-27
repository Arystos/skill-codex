import fs from "node:fs";
import path from "node:path";
import { installMcp } from "./install-mcp.js";
import { installCommands } from "./install-commands.js";
import { installHook } from "./install-hook.js";
import { runVerification } from "./verify.js";
import {
  getGlobalMcpConfigPath,
  getGlobalCommandsDir,
  getClaudeSettingsPath,
} from "../src/config/paths.js";

function log(icon: string, message: string): void {
  process.stdout.write(`${icon} ${message}\n`);
}

export async function runSetup(options: { force?: boolean } = {}): Promise<boolean> {
  log(">>", "skill-codex setup\n");

  // Step 1: Install MCP server
  log("  ", "Registering MCP server...");
  const mcpResult = installMcp({ force: options.force });
  log(mcpResult.installed ? "[ok]" : "[--]", mcpResult.message);

  // Step 2: Install slash commands
  log("  ", "Installing slash commands...");
  const cmdResult = installCommands({ global: true });
  log(cmdResult.installed.length > 0 ? "[ok]" : "[--]", cmdResult.message);

  // Step 3: Install hook
  log("  ", "Registering auto-review hook...");
  const hookResult = installHook();
  log(hookResult.installed ? "[ok]" : "[--]", hookResult.message);

  // Step 4: Verify
  log("\n  ", "Verifying installation...\n");
  const verification = await runVerification();

  for (const check of verification.results) {
    const icon = check.pass ? "[ok]" : "[!!]";
    log(`  ${icon}`, `${check.name}: ${check.detail}`);
  }

  // Summary
  log("", "");
  if (verification.allPassed) {
    log("[ok]", "Setup complete! Restart Claude Code to activate.\n");
    log("  ", "Available commands:");
    log("  ", "  /codex-review    - Code review by Codex");
    log("  ", "  /codex-do        - Delegate a task to Codex");
    log("  ", "  /codex-consult   - Get a second opinion from Codex");
    log("", "");
    log("  ", "Tip: Add .skill-codex.lock to your .gitignore");
  } else {
    log("[!!]", "Setup completed with warnings. Fix the issues above and run: npx skill-codex verify\n");
  }

  return verification.allPassed;
}

export async function runUninstall(): Promise<void> {
  log(">>", "skill-codex uninstall\n");

  // Step 1: Remove MCP server from ~/.claude.json
  const mcpConfigPath = getGlobalMcpConfigPath();
  try {
    const raw = fs.readFileSync(mcpConfigPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const mcpServers = (config as { mcpServers?: Record<string, unknown> }).mcpServers;
    if (mcpServers && "skill-codex" in mcpServers) {
      delete mcpServers["skill-codex"];
      fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      log("[ok]", "Removed MCP server");
    } else {
      log("[--]", "MCP server not found");
    }
  } catch {
    log("[--]", "MCP server not found (could not read ~/.claude.json)");
  }

  // Step 2: Remove slash commands from ~/.claude/commands/
  const commandsDir = getGlobalCommandsDir();
  const commandFiles = ["codex-review.md", "codex-do.md", "codex-consult.md"];
  for (const file of commandFiles) {
    const filePath = path.join(commandsDir, file);
    try {
      fs.unlinkSync(filePath);
      log("[ok]", `Removed ${file}`);
    } catch {
      log("[--]", `${file} not found`);
    }
  }

  // Step 3: Remove PostToolUse hook from ~/.claude/settings.json
  const settingsPath = getClaudeSettingsPath();
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    type HookEntry = { command?: string; hooks?: HookEntry[] };
    type HooksMap = Record<string, HookEntry[]>;
    const hooks = settings.hooks as HooksMap | undefined;
    if (hooks) {
      let removed = false;
      for (const eventType of Object.keys(hooks)) {
        const before = hooks[eventType].length;
        hooks[eventType] = hooks[eventType].filter(
          (entry) => !(entry.command ?? "").includes("skill-codex")
        );
        if (hooks[eventType].length < before) removed = true;
      }
      if (removed) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
        log("[ok]", "Removed PostToolUse hook");
      } else {
        log("[--]", "PostToolUse hook not found");
      }
    } else {
      log("[--]", "PostToolUse hook not found");
    }
  } catch {
    log("[--]", "Could not read ~/.claude/settings.json");
  }

  log("", "");
  log("[ok]", "Uninstall complete. Restart Claude Code to apply changes.");
}
