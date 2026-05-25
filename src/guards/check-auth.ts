import { execFile } from "node:child_process";
import { AuthExpiredError, NetworkError, CliNotFoundError } from "../errors/errors.js";
import { getCachedBinaryPath } from "./check-binary.js";
import { getSandboxConfigArgs } from "../runner/sandbox-args.js";

const AUTH_CACHE_TTL_MS = 60_000;

let authCachedAt: number | null = null;

export function resetAuthCache(): void {
  authCachedAt = null;
}

export async function checkAuth(): Promise<void> {
  const now = Date.now();

  if (authCachedAt !== null && now - authCachedAt < AUTH_CACHE_TTL_MS) {
    return;
  }

  const binary = getCachedBinaryPath() ?? "codex";

  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      ["exec", "--sandbox", "read-only", ...getSandboxConfigArgs(), "--skip-git-repo-check", "--ephemeral", "echo ok"],
      { timeout: 30_000, shell: process.platform === "win32" },
      (error, _stdout, stderr) => {
        if (!error) {
          authCachedAt = Date.now();
          resolve();
          return;
        }

        const lower = (stderr ?? error.message ?? "").toLowerCase();

        // Distinguish error types instead of masking everything as auth
        if (error.code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new CliNotFoundError());
          return;
        }

        if (error.killed) {
          reject(new NetworkError("Auth check timed out — check your network connection"));
          return;
        }

        if (["econnrefused", "econnreset", "etimedout", "network error", "fetch failed"].some((p) => lower.includes(p))) {
          reject(new NetworkError("Network error during auth check"));
          return;
        }

        // Default: treat as auth issue
        reject(new AuthExpiredError());
      },
    );
    child.stdin?.end();
  });
}
