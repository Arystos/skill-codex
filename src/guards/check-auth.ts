import { execFile } from "node:child_process";
import { AuthExpiredError } from "../errors/errors.js";

export async function checkAuth(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "codex",
      ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "echo ok"],
      { timeout: 15_000 },
      (error) => {
        if (error) {
          reject(new AuthExpiredError());
          return;
        }
        resolve();
      },
    );
    child.stdin?.end();
  });
}
