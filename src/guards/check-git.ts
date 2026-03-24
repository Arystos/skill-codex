import { execFileSync } from "node:child_process";

export interface GitCheckResult {
  readonly isGitRepo: boolean;
}

export function checkGit(cwd: string): GitCheckResult {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      stdio: "pipe",
      timeout: 5_000,
    });
    return { isGitRepo: true };
  } catch {
    return { isGitRepo: false };
  }
}
