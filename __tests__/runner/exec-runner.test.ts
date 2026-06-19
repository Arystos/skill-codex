import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { CliNotFoundError } from "../../src/errors/errors.js";

// Mock node:child_process before importing module under test
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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

  it("uses native review with uncommitted changes and no sandbox", async () => {
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    const validOutput = JSON.stringify({ type: "result", content: "done" }) + "\n";
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
    try {
      const validOutput = JSON.stringify({ type: "result", content: "ok" }) + "\n";
      const proc = makeMockProcess({ stdoutData: validOutput });
      mockSpawn.mockReturnValue(proc as any);

      await execCodex({ prompt: "review", cwd: "/tmp", mode: "exec" });

      const [_bin, args] = mockSpawn.mock.calls[0];
      expect(args).toContain("-c");
      expect(args).toContain("windows.sandbox=unelevated");
    } finally {
      if (original) Object.defineProperty(process, "platform", original);
    }
  });

  it("writes prompt to stdin", async () => {
    const validOutput = JSON.stringify({ type: "result", content: "ok" }) + "\n";
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await execCodex({ prompt: "my prompt text", cwd: "/tmp", mode: "exec" });

    const written = (proc as any)._writtenChunks.join("");
    expect(written).toBe("my prompt text");
  });

  it("resolves with parsed content on exit code 0", async () => {
    const validOutput = JSON.stringify({ type: "result", content: "Review complete" }) + "\n";
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    const result = await execCodex({ prompt: "check code", cwd: "/tmp", mode: "exec" });

    expect(result.content).toBe("Review complete");
  });

  it("rejects with BridgeError on non-zero exit code", async () => {
    const proc = makeMockProcess({ exitCode: 1, stderrData: "some failure" });
    mockSpawn.mockReturnValue(proc as any);

    await expect(
      execCodex({ prompt: "fail", cwd: "/tmp", mode: "exec" }),
    ).rejects.toThrow("Codex exited with code 1");
  });

  it("rejects with AuthExpiredError on unauthorized stderr", async () => {
    const { AuthExpiredError } = await import("../../src/errors/errors.js");
    const proc = makeMockProcess({ exitCode: 1, stderrData: "Unauthorized: invalid api key" });
    mockSpawn.mockReturnValue(proc as any);

    await expect(
      execCodex({ prompt: "fail", cwd: "/tmp", mode: "exec" }),
    ).rejects.toThrow(AuthExpiredError);
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

  it("does not call onProgress when none is provided (no throw)", async () => {
    const validOutput = JSON.stringify({ type: "result", content: "ok" }) + "\n";
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await expect(execCodex({ prompt: "x", cwd: "/tmp", mode: "exec" })).resolves.toBeDefined();
  });

  it("uses cached binary path when spawning", async () => {
    mockGetCachedBinaryPath.mockReturnValue("/opt/bin/codex");
    const validOutput = JSON.stringify({ type: "result", content: "ok" }) + "\n";
    const proc = makeMockProcess({ stdoutData: validOutput });
    mockSpawn.mockReturnValue(proc as any);

    await execCodex({ prompt: "hello", cwd: "/tmp", mode: "exec" });

    const [bin] = mockSpawn.mock.calls[0];
    expect(bin).toBe("/opt/bin/codex");
  });
});
