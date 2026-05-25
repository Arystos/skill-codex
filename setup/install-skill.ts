import fs from "node:fs";
import path from "node:path";
import { getGlobalSkillsDir } from "../src/config/paths.js";
import { getPackageRoot } from "../src/config/package-root.js";

const SKILL_NAME = "codex-bridge";

interface InstallSkillResult {
  readonly installed: boolean;
  readonly targetDir: string;
  readonly copiedFiles: readonly string[];
  readonly message: string;
}

function getSkillSourceDir(): string {
  return path.join(getPackageRoot(), "skills", SKILL_NAME);
}

function copyDirRecursive(source: string, target: string): readonly string[] {
  const copied: string[] = [];

  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copied.push(...copyDirRecursive(sourcePath, targetPath));
    } else if (entry.isFile()) {
      const sourceContent = fs.readFileSync(sourcePath);
      let shouldWrite = true;
      if (fs.existsSync(targetPath)) {
        const existing = fs.readFileSync(targetPath);
        shouldWrite = !existing.equals(sourceContent);
      }
      if (shouldWrite) {
        fs.writeFileSync(targetPath, sourceContent);
        copied.push(entry.name);
      }
    }
  }

  return copied;
}

export function installSkill(): InstallSkillResult {
  const sourceDir = getSkillSourceDir();
  const targetDir = path.join(getGlobalSkillsDir(), SKILL_NAME);

  if (!fs.existsSync(sourceDir)) {
    return {
      installed: false,
      targetDir,
      copiedFiles: [],
      message: `Skill source not found at ${sourceDir}`,
    };
  }

  const skillFile = path.join(sourceDir, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    return {
      installed: false,
      targetDir,
      copiedFiles: [],
      message: `SKILL.md missing in ${sourceDir}`,
    };
  }

  const copied = copyDirRecursive(sourceDir, targetDir);

  return {
    installed: true,
    targetDir,
    copiedFiles: copied,
    message: copied.length > 0
      ? `Installed skill '${SKILL_NAME}' to ${targetDir} (${copied.length} file(s))`
      : `Skill '${SKILL_NAME}' already up to date`,
  };
}

export function uninstallSkill(): { removed: boolean; targetDir: string } {
  const targetDir = path.join(getGlobalSkillsDir(), SKILL_NAME);
  if (!fs.existsSync(targetDir)) {
    return { removed: false, targetDir };
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  return { removed: true, targetDir };
}
