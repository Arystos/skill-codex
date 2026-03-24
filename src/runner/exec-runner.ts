import { spawn } from "node:child_process";
import { BRIDGE_DEPTH_ENV, DEFAULT_TIMEOUT_MS, TIMEOUT_ENV, TRANSIENT_PATTERNS, AUTH_ERROR_PATTERNS } from "../config/constants.js";
import { getNextDepth } from "../guards/check-recursion.js";
import { isWindows } from "../util/platform.js";
import { setupTimeout } from "./timeout.js";
import { parseCodexOutput, type CodexResult } from "./output-parser.js";
import {
  BridgeError,
  AuthExpiredError,
  RateLimitError,
  ServerError,
  NetworkError,
} from "../errors/errors.js";

export interface ExecParams {
  readonly prompt: string;
  readonly cwd: string;
  readonly mode: "exec" | "full-auto";
  readonly timeoutMs?: number;
  readonly additionalArgs?: readonly string[];
}

function getTimeout(override?: number): number {
  if (override !== undefined) return override;
  const envVal = process.env[TIMEOUT_ENV];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function classifyError(exitCode: number, stderr: string): BridgeError {
  const lower = stderr.toLowerCase();

  if (AUTH_ERROR_PATTERNS.some((p) => lower.includes(p))) {
    return new AuthExpiredError();
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return new RateLimitError();
  }
  if (["500", "502", "503", "504", "internal server error", "bad gateway", "service unavailable"].some((p) => lower.includes(p))) {
    return new ServerError(stderr.slice(0, 200));
  }
  if (["econnreset", "econnrefused", "etimedout", "network error", "fetch failed", "socket hang up"].some((p) => lower.includes(p))) {
    return new NetworkError(stderr.slice(0, 200));
  }

  return new BridgeError(
    `Codex exited with code ${exitCode}: ${stderr.slice(0, 300)}`,
    "EXEC_FAILED",
    false,
  );
}

export function execCodex(params: ExecParams): Promise<CodexResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = getTimeout(params.timeoutMs);
    const args: string[] = ["exec", "--json", "--skip-git-repo-check"];

    if (params.mode === "full-auto") {
      args.push("--full-auto");
    } else {
      args.push("--sandbox", "read-only");
    }

    if (params.additionalArgs) {
      args.push(...params.additionalArgs);
    }

    args.push(params.prompt);

    const env = {
      ...process.env,
      [BRIDGE_DEPTH_ENV]: String(getNextDepth()),
    };

    const child = spawn("codex", args, {
      cwd: params.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows(),
      windowsHide: true,
    });

    const { clear: clearTimeout_, promise: timeoutPromise } = setupTimeout(child, timeoutMs);

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdin?.end();

    const onClose = (exitCode: number | null): void => {
      clearTimeout_();

      if (exitCode === 0 || exitCode === null) {
        try {
          const result = parseCodexOutput(stdout);
          resolve(result);
        } catch (err) {
          reject(err);
        }
        return;
      }

      reject(classifyError(exitCode, stderr));
    };

    child.on("close", onClose);

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout_();
      if (err.code === "ENOENT") {
        reject(new BridgeError("codex command not found", "CLI_NOT_FOUND", false));
      } else {
        reject(new BridgeError(`Failed to spawn codex: ${err.message}`, "SPAWN_ERROR", false));
      }
    });

    // Race with timeout
    timeoutPromise.catch((err) => {
      reject(err);
    });
  });
}
