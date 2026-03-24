import fs from "node:fs";
import path from "node:path";
import { getClaudeSettingsPath } from "../src/config/paths.js";
import { isWindows } from "../src/util/platform.js";
import { getPackageRoot } from "../src/config/package-root.js";

interface HookCommand {
  type: "command";
  command: string;
}

interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
}

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function getHookScriptPath(): string {
  const hooksDir = path.join(getPackageRoot(), "hooks");
  return isWindows()
    ? path.join(hooksDir, "post-tool-use-review.ps1")
    : path.join(hooksDir, "post-tool-use-review.sh");
}

function buildHookCommand(): { command: string; scriptPath: string } | null {
  const scriptPath = getHookScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return null;
  }
  const command = isWindows()
    ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
    : `bash "${scriptPath}"`;
  return { command, scriptPath };
}

export function installHook(): {
  installed: boolean;
  settingsPath: string;
  message: string;
} {
  const settingsPath = getClaudeSettingsPath();
  let settings: ClaudeSettings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, "utf-8");
      settings = JSON.parse(raw) as ClaudeSettings;
    } catch {
      return {
        installed: false,
        settingsPath,
        message: `Failed to parse ${settingsPath}. Back it up and fix manually.`,
      };
    }
  }

  const hookResult = buildHookCommand();
  if (!hookResult) {
    return {
      installed: false,
      settingsPath,
      message: "Hook script not found. Run `npm run build` first.",
    };
  }

  // Correct Claude Code hook format: matcher + hooks array
  const hookEntry: HookEntry = {
    matcher: "Write|Edit|MultiEdit|NotebookEdit",
    hooks: [
      {
        type: "command",
        command: hookResult.command,
      },
    ],
  };

  const existingHooks = settings.hooks?.PostToolUse ?? [];

  // Check if already registered (search in nested hooks array)
  const alreadyExists = existingHooks.some((h) =>
    h.hooks?.some((inner) => inner.command.includes("codex-bridge")),
  );
  if (alreadyExists) {
    return {
      installed: false,
      settingsPath,
      message: "codex-bridge hook already registered.",
    };
  }

  const updatedSettings: ClaudeSettings = {
    ...settings,
    hooks: {
      ...settings.hooks,
      PostToolUse: [...existingHooks, hookEntry],
    },
  };

  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write: temp file then rename
  const tmpPath = settingsPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(updatedSettings, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, settingsPath);

  // Ensure bash script is executable on unix
  if (!isWindows()) {
    const shPath = path.resolve(path.dirname(getHookScriptPath()), "post-tool-use-review.sh");
    try {
      fs.chmodSync(shPath, 0o755);
    } catch {
      // Best effort
    }
  }

  return {
    installed: true,
    settingsPath,
    message: `PostToolUse hook registered in ${settingsPath}`,
  };
}
