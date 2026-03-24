import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LOCK_FILENAME, LOCK_STALE_MS } from "../config/constants.js";
import { LockConflictError } from "../errors/errors.js";

interface LockData {
  readonly pid: number;
  readonly timestamp: number;
  readonly hostname: string;
}

export interface LockHandle {
  readonly release: () => void;
}

function getLockPath(cwd: string): string {
  return path.join(cwd, LOCK_FILENAME);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isLockStale(data: LockData): boolean {
  const age = Date.now() - data.timestamp;
  if (age > LOCK_STALE_MS) return true;
  if (!isProcessAlive(data.pid)) return true;
  return false;
}

function tryRemoveStaleLock(lockPath: string): boolean {
  try {
    const raw = fs.readFileSync(lockPath, "utf-8");
    const data: LockData = JSON.parse(raw);
    if (isLockStale(data)) {
      fs.unlinkSync(lockPath);
      return true;
    }
    throw new LockConflictError(data.pid);
  } catch (err) {
    if (err instanceof LockConflictError) throw err;
    // File disappeared or is unreadable — try to acquire
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    return true;
  }
}

export function acquireLock(cwd: string): LockHandle {
  const lockPath = getLockPath(cwd);
  const lockData: LockData = {
    pid: process.pid,
    timestamp: Date.now(),
    hostname: os.hostname(),
  };
  const content = JSON.stringify(lockData, null, 2);

  try {
    fs.writeFileSync(lockPath, content, { flag: "wx" });
  } catch (err: unknown) {
    const fsErr = err as NodeJS.ErrnoException;
    if (fsErr.code === "EEXIST") {
      tryRemoveStaleLock(lockPath);
      // Retry once after stale removal — wrap in try/catch for TOCTOU race
      try {
        fs.writeFileSync(lockPath, content, { flag: "wx" });
      } catch (retryErr: unknown) {
        const retryFsErr = retryErr as NodeJS.ErrnoException;
        if (retryFsErr.code === "EEXIST") {
          // Another process won the race
          throw new LockConflictError(0);
        }
        throw retryErr;
      }
    } else {
      throw err;
    }
  }

  // Signal handlers — stored for removal in release()
  const onExit = (): void => {
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
  };

  process.on("exit", onExit);
  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);

  const release = (): void => {
    // Remove signal handlers first to prevent double-cleanup
    process.removeListener("exit", onExit);
    process.removeListener("SIGINT", onExit);
    process.removeListener("SIGTERM", onExit);
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
  };

  return { release };
}
