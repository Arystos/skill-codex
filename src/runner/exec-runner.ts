import { spawn } from "node:child_process";
import which from "which";
import { BRIDGE_DEPTH_ENV, DEFAULT_TIMEOUT_MS, TIMEOUT_ENV } from "../config/constants.js";
import { getNextDepth } from "../guards/check-recursion.js";
import { setupTimeout } from "./timeout.js";
import { parseCodexOutput, type CodexResult } from "./output-parser.js";
import {
  BridgeError,
  CliNotFoundError,
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

  // Check auth errors first but exclude generic "auth" in context
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("api key")) {
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

async function resolveCodexBinary(): Promise<string> {
  try {
    return await which("codex");
  } catch {
    throw new CliNotFoundError();
  }
}

export async function execCodex(params: ExecParams): Promise<CodexResult> {
  // Resolve the full binary path — no shell needed
  const codexPath = await resolveCodexBinary();

  return new Promise((resolve, reject) => {
    const timeoutMs = getTimeout(params.timeoutMs);
    const args: string[] = ["exec", "--json", "--skip-git-repo-check"];

    if (params.mode === "full-auto") {
      args.push("--full-auto");
    } else {
      args.push("--sandbox", "read-only");
    }

    // Prompt passed via stdin to avoid shell injection — NOT as a positional arg
    const stdinPrompt = params.prompt;

    // Use "-" to tell codex to read prompt from stdin
    args.push("-");

    const env = {
      ...process.env,
      [BRIDGE_DEPTH_ENV]: String(getNextDepth()),
    };

    // shell: false — codexPath is the resolved absolute path, no shell resolution needed
    const child = spawn(codexPath, args, {
      cwd: params.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
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

    // Write prompt via stdin then close — safe from shell injection
    child.stdin?.write(stdinPrompt);
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
        reject(new CliNotFoundError());
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
