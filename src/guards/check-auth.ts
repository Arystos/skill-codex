import { execFile } from "node:child_process";
import { AuthExpiredError, NetworkError, CliNotFoundError } from "../errors/errors.js";

export async function checkAuth(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "codex",
      ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "echo ok"],
      { timeout: 15_000 },
      (error, _stdout, stderr) => {
        if (!error) {
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
