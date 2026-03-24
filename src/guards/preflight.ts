import type { LockHandle } from "../lock/lock-file.js";
import { NotGitRepoError } from "../errors/errors.js";
import { checkRecursion } from "./check-recursion.js";
import { checkBinary } from "./check-binary.js";
import { checkAuth } from "./check-auth.js";
import { checkLock } from "./check-lock.js";
import { checkGit } from "./check-git.js";

export interface PreflightOptions {
  readonly cwd: string;
  readonly requireGit: boolean;
  readonly skipAuth?: boolean;
  readonly skipLock?: boolean;
}

export interface PreflightResult {
  readonly lockHandle: LockHandle | null;
}

export async function runPreflight(
  options: PreflightOptions,
): Promise<PreflightResult> {
  // Order: cheapest checks first (fail-fast)
  // 1. Recursion (env read — instant)
  checkRecursion();

  // 2. Binary exists (filesystem lookup)
  await checkBinary();

  // 3. Auth valid (spawns a quick process)
  if (!options.skipAuth) {
    await checkAuth();
  }

  // 4. Lock file (filesystem write)
  let lockHandle: LockHandle | null = null;
  if (!options.skipLock) {
    lockHandle = checkLock(options.cwd);
  }

  // 5. Git repo (if required)
  if (options.requireGit) {
    const { isGitRepo } = checkGit(options.cwd);
    if (!isGitRepo) {
      lockHandle?.release();
      throw new NotGitRepoError(options.cwd);
    }
  }

  return { lockHandle };
}
