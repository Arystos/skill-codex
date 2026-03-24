import type { ChildProcess } from "node:child_process";
import { KILL_GRACE_MS } from "../config/constants.js";
import { TimeoutError } from "../errors/errors.js";
import { isWindows } from "../util/platform.js";

export function setupTimeout(
  child: ChildProcess,
  timeoutMs: number,
): { clear: () => void; promise: Promise<never> } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Phase 1: graceful kill
      child.kill("SIGTERM");

      // Phase 2: force kill after grace period
      graceTimer = setTimeout(() => {
        try {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        } catch {
          // Process may already be gone — ignore
        }
      }, KILL_GRACE_MS);

      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
  });

  const clear = (): void => {
    if (timer) clearTimeout(timer);
    if (graceTimer) clearTimeout(graceTimer);
  };

  return { clear, promise };
}
