import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AuthExpiredError,
  BridgeError,
  CliNotFoundError,
  InvalidRequestError,
  NetworkError,
  RateLimitError,
  ServerError,
} from "../../src/errors/errors.js";

// Mock node:child_process before importing module under test
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  // `git rev-parse --show-toplevel`, used to trust the repo under the elevated Windows sandbox
  execFileSync: vi.fn(() => "C:/repo\n"),
}));

// Mock guard modules before importing module under test
vi.mock("../../src/guards/check-binary.js", () => ({
  getCachedBinaryPath: vi.fn(),
}));

vi.mock("../../src/guards/check-recursion.js", () => ({
  getNextDepth: vi.fn(),
}));

// Mock timeout to avoid real timers and allow process to complete
vi.mock("../../src/runner/timeout.js", () => ({
  setupTimeout: vi.fn(() => ({
    clear: vi.fn(),
    promise: new Promise(() => {}), // never rejects — tests control close event
  })),
}));

import { spawn } from "node:child_process";
import { getCachedBinaryPath } from "../../src/guards/check-binary.js";
import { getNextDepth } from "../../src/guards/check-recursion.js";
import { execCodex } from "../../src/runner/exec-runner.js";
import { withRetry } from "../../src/runner/retry.js";
import { NO_FINAL_MESSAGE } from "../../src/runner/output-parser.js";

const mockSpawn = vi.mocked(spawn);
const mockGetCachedBinaryPath = vi.mocked(getCachedBinaryPath);
const mockGetNextDepth = vi.mocked(getNextDepth);

/** Build a minimal fake ChildProcess that emits "close" after a tick. */
function makeMockProcess(opts: {
  exitCode?: number;
  stdoutData?: string;
  stderrData?: string;
} = {}) {
  const { exitCode = 0, stdoutData = "", stderrData = "" } = opts;

  const proc = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    stdin: Writable;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };

  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });

  const writtenChunks: string[] = [];
  proc.stdin = new Writable({
    write(chunk, _enc, cb) {
      writtenChunks.push(chunk.toString());
      cb();
    },
  });
  // Expose written data for assertions
  (proc as any)._writtenChunks = writtenChunks;

  proc.killed = false;
  proc.kill = vi.fn();

  // Emit stdout/stderr data and then close after a short delay
  setTimeout(() => {
    if (stdoutData) proc.stdout.push(stdoutData);
    proc.stdout.push(null);

    if (stderrData) proc.stderr.push(stderrData);
    proc.stderr.push(null);

    proc.emit("close", exitCode);
  }, 0);

  return proc;
}

/** JSONL lines, one event per line, as `codex exec --json` writes them. */
function jsonl(...events: unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

/** A minimal successful `codex exec --json` run ending in one agent message. */
function agentOutput(text: string): string {
  return jsonl(
    { type: "thread.started", thread_id: "0199a213-81c0-7800-8aa1-bbab2a035a53" },
    { type: "turn.started" },
    { type: "item.completed", item: { id: "item_0", type: "agent_message", text } },
    { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0 } },
  );
}

/** A failed run: transient reconnect noise, then a terminal `turn.failed`. */
function failedOutput(message: string): string {
  return jsonl(
    { type: "thread.started", thread_id: "0199a213-81c0-7800-8aa1-bbab2a035a53" },
    { type: "turn.started" },
    { type: "error", message: "Reconnecting... 2/5 (workspace routing discovery unauthorized (401))" },
    { type: "item.completed", item: { id: "item_0", type: "error", message: "Falling back from WebSockets to HTTPS transport." } },
    { type: "turn.failed", error: { message } },
  );
}

describe("execCodex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedBinaryPath.mockReturnValue("/usr/bin/codex");
    mockGetNextDepth.mockReturnValue(1);
  });

  it("throws CliNotFoundError when getCachedBinaryPath returns null", async () => {
    mockGetCachedBinaryPath.mockReturnValue(null);

    await expect(
      execCodex({ prompt: "test", cwd: "/tmp", mode: "exec" }),
    ).rejects.toThrow(CliNotFoundError);

    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("passes correct args for a fresh exec run (includes --sandbox, read-only)", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await execCodex({ prompt: "review this", cwd: "/tmp", mode: "exec" });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("exec");
    expect(args).toContain("--sandbox");
    expect(args).toContain("read-only");
    expect(args).not.toContain("--full-auto");
    // Prompt is passed via stdin using "-" sentinel
    expect(args).toContain("-");
  });

  it("passes --sandbox workspace-write for full-auto mode (not deprecated --full-auto)", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await execCodex({ prompt: "do it", cwd: "/tmp", mode: "full-auto" });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("--sandbox");
    expect(args).toContain("workspace-write");
    expect(args).not.toContain("--full-auto");
    expect(args).not.toContain("read-only");
  });

  it("lets explicit sandbox override mode", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await execCodex({
      prompt: "do it",
      cwd: "/tmp",
      mode: "full-auto",
      sandbox: "danger-full-access",
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("--sandbox");
    expect(args).toContain("danger-full-access");
    expect(args).not.toContain("workspace-write");
  });

  it("adds model args when provided", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    await execCodex({
      prompt: "do it",
      cwd: "/tmp",
      mode: "exec",
      model: "gpt-5.4-mini",
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("-m");
    expect(args).toContain("gpt-5.4-mini");
  });

  it("adds reasoning effort config when provided", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    await execCodex({
      prompt: "do it",
      cwd: "/tmp",
      mode: "exec",
      reasoningEffort: "high",
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("-c");
    expect(args).toContain("model_reasoning_effort=high");
  });

  it("uses exec resume without --sandbox when sessionId is provided", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await execCodex({
      prompt: "continue",
      cwd: "/tmp",
      mode: "exec",
      sandbox: "danger-full-access",
      sessionId: "session-123",
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args.slice(0, 3)).toEqual(["exec", "resume", "session-123"]);
    expect(args).toContain("--json");
    expect(args).toContain("--skip-git-repo-check");
    expect(args).not.toContain("--sandbox");
    expect(args).toContain("-");
  });

  describe("--add-dir", () => {
    const withPlatform = async (platform: NodeJS.Platform, fn: () => Promise<void>): Promise<void> => {
      const original = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", { value: platform, configurable: true });
      vi.stubEnv("SKILL_CODEX_WINDOWS_SANDBOX", "unelevated");
      try {
        await fn();
      } finally {
        if (original) Object.defineProperty(process, "platform", original);
        vi.unstubAllEnvs();
      }
    };

    it("repeats --add-dir once per directory on a fresh exec run, before the stdin sentinel", async () => {
      await withPlatform("linux", async () => {
        mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput("ok") }) as any);
        await execCodex({ prompt: "x", cwd: "/repo/app", mode: "full-auto", addDirs: ["/repo/lib", "/repo/shared lib"] });

        const [_bin, args] = mockSpawn.mock.calls[0];
        const flags = args.flatMap((a: string, i: number) => (a === "--add-dir" ? [args[i + 1]] : []));
        expect(flags).toEqual(["/repo/lib", "/repo/shared lib"]);
        expect(args[args.length - 1]).toBe("-");
      });
    });

    it("quotes each directory for cmd.exe on Windows", async () => {
      await withPlatform("win32", async () => {
        mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput("ok") }) as any);
        await execCodex({ prompt: "x", cwd: "C:\\repo", mode: "full-auto", addDirs: ["C:\\Users\\John Smith\\lib", "D:\\"] });

        const [_bin, args] = mockSpawn.mock.calls[0];
        const flags = args.flatMap((a: string, i: number) => (a === "--add-dir" ? [args[i + 1]] : []));
        expect(flags).toEqual(['"C:\\Users\\John Smith\\lib"', '"D:\\\\"']);
      });
    });

    it("never passes --add-dir to exec resume or exec review", async () => {
      mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput("ok") }) as any);
      await execCodex({ prompt: "x", cwd: "/tmp", mode: "full-auto", sessionId: "s-1", addDirs: ["/tmp/lib"] });
      mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput("ok") }) as any);
      await execCodex({ prompt: "", cwd: "/tmp", mode: "full-auto", review: true, addDirs: ["/tmp/lib"] });

      for (const call of mockSpawn.mock.calls) expect(call[1]).not.toContain("--add-dir");
    });
  });

  it("uses native review with uncommitted changes and no sandbox", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    await execCodex({
      prompt: "",
      cwd: "/tmp",
      mode: "exec",
      sandbox: "danger-full-access",
      review: true,
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args.slice(0, 4)).toEqual(["exec", "review", "--json", "--skip-git-repo-check"]);
    expect(args).toContain("--uncommitted");
    expect(args).not.toContain("--sandbox");
    expect(args).not.toContain("danger-full-access");
    // A scope flag forbids a PROMPT, so the "-" stdin sentinel must NOT be sent.
    expect(args).not.toContain("-");
  });

  it("uses prompt-only review (custom instructions, no scope flag)", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    await execCodex({
      prompt: "focus on the auth changes",
      cwd: "/tmp",
      mode: "exec",
      review: true,
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args.slice(0, 4)).toEqual(["exec", "review", "--json", "--skip-git-repo-check"]);
    // Custom instructions go over stdin ("-"); no scope flag is added.
    expect(args).toContain("-");
    expect(args).not.toContain("--uncommitted");
  });

  it("uses native review base when provided", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    await execCodex({
      prompt: "focus on auth",
      cwd: "/tmp",
      mode: "exec",
      review: true,
      reviewBase: "main",
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("--base");
    expect(args).toContain("main");
    expect(args).not.toContain("--uncommitted");
    expect(args).not.toContain("--commit");
  });

  it("uses native review commit when provided without a base", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    await execCodex({
      prompt: "focus on auth",
      cwd: "/tmp",
      mode: "exec",
      review: true,
      reviewCommit: "abc1234",
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("--commit");
    expect(args).toContain("abc1234");
    expect(args).not.toContain("--uncommitted");
    expect(args).not.toContain("--base");
  });

  it("applies model and reasoning effort to native review", async () => {
    const validOutput = agentOutput("done");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    await execCodex({
      prompt: "focus on auth",
      cwd: "/tmp",
      mode: "exec",
      review: true,
      model: "gpt-5.5",
      reasoningEffort: "xhigh",
    });

    const [_bin, args] = mockSpawn.mock.calls[0];
    expect(args.slice(0, 4)).toEqual(["exec", "review", "--json", "--skip-git-repo-check"]);
    expect(args).toContain("-m");
    expect(args).toContain("gpt-5.5");
    expect(args).toContain("-c");
    expect(args).toContain("model_reasoning_effort=xhigh");
    expect(args).not.toContain("--sandbox");
  });

  it("injects windows.sandbox=unelevated config when running on Windows", async () => {
    const original = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    // An empty Codex home, so the developer's own config.toml can't change the mode.
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "sc-runner-home-"));
    vi.stubEnv("CODEX_HOME", codexHome);
    try {
      const validOutput = agentOutput("ok");
      const proc = makeMockProcess({ stdoutData: validOutput });
      mockSpawn.mockReturnValue(proc as any);

      await execCodex({ prompt: "review", cwd: "/tmp", mode: "exec" });

      const [_bin, args] = mockSpawn.mock.calls[0];
      expect(args).toContain("-c");
      expect(args).toContain("windows.sandbox=unelevated");
    } finally {
      if (original) Object.defineProperty(process, "platform", original);
      vi.unstubAllEnvs();
      fs.rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("trusts the workspace repo for git under the elevated Windows sandbox", async () => {
    const original = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.stubEnv("SKILL_CODEX_WINDOWS_SANDBOX", "elevated");
    try {
      mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput("ok") }) as any);
      await execCodex({ prompt: "review", cwd: "/tmp", mode: "exec" });

      const env = mockSpawn.mock.calls[0]?.[2]?.env as Record<string, string>;
      const index = Number(env.GIT_CONFIG_COUNT) - 1;
      expect(env[`GIT_CONFIG_KEY_${index}`]).toBe("safe.directory");
      expect(env[`GIT_CONFIG_VALUE_${index}`]).toBe("C:/repo");
    } finally {
      if (original) Object.defineProperty(process, "platform", original);
      vi.unstubAllEnvs();
    }
  });

  describe("--output-schema", () => {
    it("passes the schema file unquoted outside Windows, before the stdin sentinel", async () => {
      const original = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      try {
        mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput('{"ok":true}') }) as any);
        await execCodex({ prompt: "x", cwd: "/tmp", mode: "exec", outputSchemaPath: "/tmp/s/schema.json" });

        const [_bin, args] = mockSpawn.mock.calls[0];
        const i = args.indexOf("--output-schema");
        expect(args[i + 1]).toBe("/tmp/s/schema.json");
        expect(args[args.length - 1]).toBe("-");
      } finally {
        if (original) Object.defineProperty(process, "platform", original);
      }
    });

    it("passes the schema file to exec resume", async () => {
      mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput('{"ok":true}') }) as any);
      await execCodex({ prompt: "x", cwd: "/tmp", mode: "exec", sessionId: "s-1", outputSchemaPath: "/tmp/schema.json" });

      const [_bin, args] = mockSpawn.mock.calls[0];
      expect(args.slice(0, 3)).toEqual(["exec", "resume", "s-1"]);
      expect(args).toContain("--output-schema");
    });

    it("omits the flag when no schema is given", async () => {
      mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput("ok") }) as any);
      await execCodex({ prompt: "x", cwd: "/tmp", mode: "exec" });
      expect(mockSpawn.mock.calls[0][1]).not.toContain("--output-schema");
    });

    it("quotes the schema path for cmd.exe on Windows", async () => {
      const original = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      vi.stubEnv("SKILL_CODEX_WINDOWS_SANDBOX", "unelevated");
      try {
        mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: agentOutput("ok") }) as any);
        await execCodex({ prompt: "x", cwd: "/tmp", mode: "exec", outputSchemaPath: "C:\\Users\\John Smith\\schema.json" });

        const [_bin, args] = mockSpawn.mock.calls[0];
        expect(args[args.indexOf("--output-schema") + 1]).toBe('"C:\\Users\\John Smith\\schema.json"');
      } finally {
        if (original) Object.defineProperty(process, "platform", original);
        vi.unstubAllEnvs();
      }
    });

    it("refuses a schema path with shell metacharacters without spawning", async () => {
      await expect(
        execCodex({ prompt: "x", cwd: "/tmp", mode: "exec", outputSchemaPath: "/tmp/a&calc/schema.json" }),
      ).rejects.toThrow(/unsafe/);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  it("writes prompt to stdin", async () => {
    const validOutput = agentOutput("ok");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await execCodex({ prompt: "my prompt text", cwd: "/tmp", mode: "exec" });

    const written = (proc as any)._writtenChunks.join("");
    expect(written).toBe("my prompt text");
  });

  it("resolves with parsed content on exit code 0", async () => {
    const validOutput = agentOutput("Review complete");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    const result = await execCodex({ prompt: "check code", cwd: "/tmp", mode: "exec" });

    expect(result.content).toBe("Review complete");
  });

  it("does not retry a write run that ended with an empty final message (#59)", async () => {
    const stdoutData = [
      { type: "thread.started", thread_id: "t-59" },
      { type: "item.completed", item: { id: "item_1", type: "file_change", status: "completed", changes: [{ path: "hello.txt", kind: "add" }] } },
      { type: "item.completed", item: { id: "item_2", type: "agent_message", text: "" } },
      { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n");
    mockSpawn.mockImplementation(() => makeMockProcess({ stdoutData }) as any);

    const result = await withRetry(() => execCodex({ prompt: "write hello.txt", cwd: "/tmp", mode: "full-auto" }), { maxRetries: 2 });

    expect(result.content).toBe(NO_FINAL_MESSAGE);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("rejects with BridgeError on non-zero exit code", async () => {
    const proc = makeMockProcess({ exitCode: 1, stderrData: "some failure" });
    mockSpawn.mockReturnValue(proc as any);

    await expect(
      execCodex({ prompt: "fail", cwd: "/tmp", mode: "exec" }),
    ).rejects.toThrow("Codex exited with code 1");
  });

  it("rejects with AuthExpiredError on unauthorized stderr", async () => {
    const proc = makeMockProcess({ exitCode: 1, stderrData: "Unauthorized: invalid api key" });
    mockSpawn.mockReturnValue(proc as any);

    const err = await execCodex({ prompt: "fail", cwd: "/tmp", mode: "exec" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthExpiredError);
    // stderr may carry internals, so it is not echoed into the auth message.
    expect((err as Error).message).not.toContain("invalid api key");
  });

  describe("turn.failed classification", () => {
    async function runFailing(stdoutData: string, stderrData = ""): Promise<BridgeError> {
      mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 1, stdoutData, stderrData }) as any);
      const err = await execCodex({ prompt: "fail", cwd: "/tmp", mode: "exec" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeError);
      return err as BridgeError;
    }

    it("classifies an auth turn.failed with empty stderr and shows the Codex message", async () => {
      const err = await runFailing(failedOutput("workspace routing discovery unauthorized (401)"));
      expect(err).toBeInstanceOf(AuthExpiredError);
      expect(err.message).toContain("workspace routing discovery unauthorized (401)");
      expect(err.message).toContain("codex login");
    });

    it("prefers turn.failed over stderr for classification and message", async () => {
      const err = await runFailing(
        failedOutput("stream disconnected before completion: 503 Service Unavailable"),
        "Unauthorized: invalid api key",
      );
      expect(err).toBeInstanceOf(ServerError);
      expect(err.message).toContain("503 Service Unavailable");
      expect(err.message).not.toContain("invalid api key");
    });

    it("classifies a rate-limit turn.failed", async () => {
      const err = await runFailing(failedOutput("exceeded retry limit, last status: 429 Too Many Requests"));
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.message).toContain("429 Too Many Requests");
    });

    it("classifies a network turn.failed", async () => {
      const err = await runFailing(failedOutput("error sending request: fetch failed"));
      expect(err).toBeInstanceOf(NetworkError);
      expect(err.message).toContain("fetch failed");
    });

    it("uses an unclassified turn.failed message in the generic error", async () => {
      const err = await runFailing(failedOutput("turn failed"), "noisy stderr");
      expect(err.code).toBe("EXEC_FAILED");
      expect(err.message).toBe("Codex exited with code 1: turn failed");
    });

    it("surfaces a bad model as a non-retryable invalid-request error", async () => {
      // Captured live from Codex 0.163.0 with an unsupported model.
      const stdout = [
        '{"type":"thread.started","thread_id":"0199a213-81c0-7800-8aa1-bbab2a035a53"}',
        '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata for `gpt-5.6-sol` not found. Defaulting to fallback metadata; this can degrade performance and cause issues."}}',
        '{"type":"turn.started"}',
        '{"type":"error","message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-5.6-sol\' model is not supported when using Codex with a ChatGPT account.\\"}}"}',
        '{"type":"turn.failed","error":{"message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-5.6-sol\' model is not supported when using Codex with a ChatGPT account.\\"}}"}}',
      ].join("\n") + "\n";
      const err = await runFailing(stdout);
      expect(err).toBeInstanceOf(InvalidRequestError);
      expect(err.retryable).toBe(false);
      expect(err.code).toBe("INVALID_REQUEST");
      expect(err.message).toContain(
        "The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account.",
      );
      expect(err.message).not.toContain("invalid_request_error");
      expect(err.message).not.toContain("{");
    });

    it("maps an HTTP status from a JSON-encoded error before keyword matching", async () => {
      const encoded = (status: number, message: string) =>
        JSON.stringify({ type: "error", status, error: { type: "api_error", message } });
      expect(await runFailing(failedOutput(encoded(401, "Your session has ended.")))).toBeInstanceOf(AuthExpiredError);
      expect(await runFailing(failedOutput(encoded(429, "Slow down.")))).toBeInstanceOf(RateLimitError);
      expect(await runFailing(failedOutput(encoded(502, "Upstream hiccup.")))).toBeInstanceOf(ServerError);
      expect(await runFailing(failedOutput(encoded(404, "Unknown model 500x.")))).toBeInstanceOf(InvalidRequestError);
    });

    it("does not treat transient error events as fatal: falls back to stderr without turn.failed", async () => {
      const stdout = jsonl(
        { type: "turn.started" },
        { type: "error", message: "Reconnecting... 2/5 (workspace routing discovery unauthorized (401))" },
      );
      const err = await runFailing(stdout, "some failure");
      expect(err).not.toBeInstanceOf(AuthExpiredError);
      expect(err.message).toBe("Codex exited with code 1: some failure");
    });

    it("resolves when a run recovers after transient error events", async () => {
      const stdout = jsonl(
        { type: "thread.started", thread_id: "t-1" },
        { type: "turn.started" },
        { type: "error", message: "Reconnecting... 1/5 (stream disconnected before completion)" },
        { type: "item.completed", item: { id: "item_0", type: "error", message: "Falling back from WebSockets to HTTPS transport." } },
        { type: "item.completed", item: { id: "item_1", type: "agent_message", text: "Recovered" } },
        { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } },
      );
      mockSpawn.mockReturnValue(makeMockProcess({ stdoutData: stdout }) as any);
      const result = await execCodex({ prompt: "x", cwd: "/tmp", mode: "exec" });
      expect(result.content).toBe("Recovered");
    });
  });

  it("emits progress messages from stdout JSONL events and attaches logPath/durationMs", async () => {
    const out =
      JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "git status", status: "in_progress" } }) +
      "\n" +
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "All good" } }) +
      "\n" +
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }) +
      "\n";
    const proc = makeMockProcess({ stdoutData: out });
    mockSpawn.mockReturnValue(proc as any);

    const progress: string[] = [];
    const result = await execCodex({
      prompt: "check",
      cwd: "/tmp",
      mode: "exec",
      onProgress: (m) => progress.push(m),
    });

    expect(progress).toContain("running: git status");
    expect(progress).toContain("writing response…");
    expect(typeof result.logPath).toBe("string");
    expect(typeof result.durationMs).toBe("number");
  });

  it("heartbeat carries the latest plan step", async () => {
    vi.useFakeTimers();
    try {
      // A process that stays open until the test closes it.
      const proc = new EventEmitter() as any;
      proc.stdout = new Readable({ read() {} });
      proc.stderr = new Readable({ read() {} });
      proc.stdin = new Writable({ write(_c, _e, cb) { cb(); } });
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const progress: string[] = [];
      const done = execCodex({ prompt: "x", cwd: "/tmp", mode: "exec", onProgress: (m) => progress.push(m) });
      proc.stdout.push(
        jsonl({
          type: "item.updated",
          item: { type: "todo_list", items: [{ text: "write tests", completed: false }, { text: "ship", completed: false }] },
        }),
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress.at(-1)).toBe("Codex working… 10s · plan 0/2: write tests");

      proc.stdout.push(jsonl({ type: "item.completed", item: { type: "agent_message", text: "done" } }));
      proc.stdout.push(null);
      proc.stderr.push(null);
      await vi.advanceTimersByTimeAsync(0);
      proc.emit("close", 0);
      await expect(done).resolves.toMatchObject({ content: "done" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not call onProgress when none is provided (no throw)", async () => {
    const validOutput = agentOutput("ok");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await expect(execCodex({ prompt: "x", cwd: "/tmp", mode: "exec" })).resolves.toBeDefined();
  });

  it("uses cached binary path when spawning", async () => {
    mockGetCachedBinaryPath.mockReturnValue("/opt/bin/codex");
    const validOutput = agentOutput("ok");
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await execCodex({ prompt: "hello", cwd: "/tmp", mode: "exec" });

    const [bin] = mockSpawn.mock.calls[0];
    expect(bin).toBe("/opt/bin/codex");
  });
});
