import { acquireLock, type LockHandle } from "../lock/lock-file.js";

export function checkLock(cwd: string): LockHandle {
  return acquireLock(cwd);
}
