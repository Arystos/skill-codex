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

  it("passes correct args for exec mode (includes --sandbox, read-only)", async () => {
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
