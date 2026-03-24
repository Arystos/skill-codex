import fs from "node:fs";
import path from "node:path";
import { getGlobalCommandsDir } from "../src/config/paths.js";
import { getPackageRoot } from "../src/config/package-root.js";

const COMMAND_FILES = ["codex-review.md", "codex-do.md", "codex-consult.md"];

function getCommandsSourceDir(): string {
  return path.join(getPackageRoot(), "commands");
}

export function installCommands(options: { global?: boolean; projectDir?: string } = {}): {
  installed: string[];
  skipped: string[];
  targetDir: string;
  message: string;
} {
  const targetDir = options.global !== false
    ? getGlobalCommandsDir()
    : path.join(options.projectDir ?? process.cwd(), ".claude", "commands");

  const sourceDir = getCommandsSourceDir();

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const installed: string[] = [];
  const skipped: string[] = [];

  for (const file of COMMAND_FILES) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (!fs.existsSync(sourcePath)) {
      skipped.push(file);
      continue;
    }

    const sourceContent = fs.readFileSync(sourcePath, "utf-8");

    // Skip if identical content already exists
    if (fs.existsSync(targetPath)) {
      const existingContent = fs.readFileSync(targetPath, "utf-8");
      if (existingContent === sourceContent) {
        skipped.push(file);
        continue;
      }
    }

    fs.writeFileSync(targetPath, sourceContent, "utf-8");
    installed.push(file);
  }

  return {
    installed,
    skipped,
    targetDir,
    message: installed.length > 0
      ? `Installed ${installed.length} command(s) to ${targetDir}`
      : "All commands already up to date",
  };
}
