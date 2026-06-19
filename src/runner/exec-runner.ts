import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import {
  BRIDGE_DEPTH_ENV,
  DEFAULT_TIMEOUT_MS,
  TIMEOUT_ENV,
  HEARTBEAT_INTERVAL_MS,
} from "../config/constants.js";
import { getNextDepth } from "../guards/check-recursion.js";
import { getCachedBinaryPath } from "../guards/check-binary.js";
import { getSandboxConfigArgs } from "./sandbox-args.js";
import { setupTimeout } from "./timeout.js";
import { parseCodexOutput, type CodexResult } from "./output-parser.js";
import { formatProgressMessage } from "./progress.js";
import { createLiveLogger } from "../util/live-logger.js";
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
  readonly sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  readonly sessionId?: string;
  readonly model?: string;
  readonly reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  readonly review?: boolean;
  readonly reviewBase?: string;
  readonly reviewCommit?: string;
  readonly timeoutMs?: number;
  /**
   * Optional live-progress sink. Called with a short status line each time
   * Codex emits a meaningful JSONL event, plus a periodic heartbeat during
   * quiet stretches. Used to drive MCP progress notifications so a long run
   * doesn't look frozen. Best-effort — callbacks must not throw.
   */
  readonly onProgress?: (message: string) => void;
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

export async function execCodex(params: ExecParams): Promise<CodexResult> {
  // Use cached binary path from checkBinary — throws if not found
  const codexPath = getCachedBinaryPath();
  if (codexPath === null) {
    throw new CliNotFoundError();
  }

  return new Promise((resolve, reject) => {
    const timeoutMs = getTimeout(params.timeoutMs);
    let args: string[];
    // Whether to send the prompt over stdin (the `-` sentinel). For native
    // review, the codex CLI forbids combining a scope flag
    // (--uncommitted/--base/--commit) with a PROMPT, so we only pass the prompt
    // when reviewing with custom instructions and no scope flag.
    let sendStdinPrompt: boolean;
    if (params.review) {
      args = ["exec", "review", "--json", "--skip-git-repo-check"];
      if (params.reviewBase) {
        args.push("--base", params.reviewBase);
        sendStdinPrompt = false;
      } else if (params.reviewCommit) {
        args.push("--commit", params.reviewCommit);
        sendStdinPrompt = false;
      } else if (params.prompt?.trim()) {
        // Custom review instructions only — review defaults to the working tree.
        sendStdinPrompt = true;
      } else {
        args.push("--uncommitted");
        sendStdinPrompt = false;
      }
    } else if (params.sessionId) {
      // Resume keeps the original session's sandbox policy; `resume` has no --sandbox flag.
      args = ["exec", "resume", params.sessionId, "--json", "--skip-git-repo-check"];
      sendStdinPrompt = true;
    } else {
      const sandbox =
        params.sandbox ?? (params.mode === "full-auto" ? "workspace-write" : "read-only");
      args = ["exec", "--json", "--skip-git-repo-check", "--sandbox", sandbox];
      sendStdinPrompt = true;
    }

    if (params.model) {
      args.push("-m", params.model);
    }

    if (params.reasoningEffort) {
      args.push("-c", `model_reasoning_effort=${params.reasoningEffort}`);
    }

    // Platform-specific sandbox config (e.g. windows.sandbox=unelevated to work
    // around Codex's broken elevated Windows sandbox). Empty on non-Windows.
    args.push(...getSandboxConfigArgs());

    // Prompt passed via stdin to avoid shell injection — NOT as a positional arg
    const stdinPrompt = params.prompt ?? "";

    // Use "-" to tell codex to read the prompt from stdin. Omitted for review
    // runs that use a scope flag, where the CLI rejects a PROMPT.
    if (sendStdinPrompt) {
      args.push("-");
    }

    const env = {
      ...process.env,
      [BRIDGE_DEPTH_ENV]: String(getNextDepth()),
    };

    // On Windows, npm-installed CLIs are .cmd shims that require a shell to execute.
    const child = spawn(codexPath, args, {
      cwd: params.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      windowsHide: true,
    });

    const { clear: clearTimeout_, promise: timeoutPromise } = setupTimeout(child, timeoutMs);

    const startedAt = Date.now();

    // Persistent, tail-able per-run log (recovers progress the transport buffers).
    const logger = createLiveLogger({
      cwd: params.cwd,
      mode: params.mode,
      prompt: params.prompt,
    });
    process.stderr.write(`[skill-codex] live log: ${logger.path}\n`);

    // Heartbeat so quiet reasoning stretches still show the run is alive.
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    if (params.onProgress) {
      heartbeat = setInterval(() => {
        const secs = Math.round((Date.now() - startedAt) / 1000);
        params.onProgress?.(`Codex working… ${secs}s elapsed`);
      }, HEARTBEAT_INTERVAL_MS);
      if (typeof heartbeat.unref === "function") heartbeat.unref();
    }
    const stopHeartbeat = (): void => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    // Incrementally decode stdout: feed the file logger, and emit a progress
    // message per complete JSONL line.
    const decoder = new StringDecoder("utf8");
    let progressBuf = "";
    const consumeForProgress = (text: string): void => {
      if (!params.onProgress) return;
      progressBuf += text;
      let idx: number;
      while ((idx = progressBuf.indexOf("\n")) >= 0) {
        const lineStr = progressBuf.slice(0, idx).trim();
        progressBuf = progressBuf.slice(idx + 1);
        if (!lineStr) continue;
        try {
          const msg = formatProgressMessage(JSON.parse(lineStr));
          if (msg) params.onProgress(msg);
        } catch {
          // non-JSON line — ignore
        }
      }
    };

    let logFinished = false;
    const finishLog = (summary: string): void => {
      stopHeartbeat();
      if (logFinished) return;
      logFinished = true;
      try {
        logger.write(decoder.end());
        logger.finish(summary);
      } catch {
        // best-effort
      }
    };

    const stdoutChunks: Buffer[] = [];
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      const text = decoder.write(chunk);
      try {
        logger.write(text);
      } catch {
        // best-effort logging
      }
      consumeForProgress(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Write prompt via stdin then close — safe from shell injection. Skipped
    // for review-with-scope runs that don't pass `-` (the CLI rejects a PROMPT).
    if (sendStdinPrompt) {
      child.stdin?.write(stdinPrompt);
    }
    child.stdin?.end();

    const onClose = (exitCode: number | null): void => {
      clearTimeout_();
      finishLog(exitCode === 0 || exitCode === null ? "ok" : `exit ${exitCode}`);
      const stdout = Buffer.concat(stdoutChunks).toString();

      if (exitCode === 0 || exitCode === null) {
        try {
          const result = parseCodexOutput(stdout);
          resolve({ ...result, logPath: logger.path, durationMs: Date.now() - startedAt });
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
      finishLog("spawn error");
      if (err.code === "ENOENT") {
        reject(new CliNotFoundError());
      } else {
        reject(new BridgeError(`Failed to spawn codex: ${err.message}`, "SPAWN_ERROR", false));
      }
    });

    // Race with timeout
    timeoutPromise.catch((err) => {
      finishLog("timeout");
      reject(err);
    });
  });
}
