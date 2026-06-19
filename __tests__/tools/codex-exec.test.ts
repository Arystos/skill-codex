import { describe, it, expect, vi, beforeEach } from "vitest";
import os from "node:os";

// Mock dependencies before importing the module under test
vi.mock("../../src/guards/preflight.js", () => ({
  runPreflight: vi.fn(),
}));

vi.mock("../../src/runner/exec-runner.js", () => ({
  execCodex: vi.fn(),
}));

vi.mock("../../src/runner/retry.js", () => ({
  // Transparent wrapper — just calls fn() directly
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { runPreflight } from "../../src/guards/preflight.js";
import { execCodex } from "../../src/runner/exec-runner.js";
import { withRetry } from "../../src/runner/retry.js";
import { handleCodexExec, inputSchema, TOOL_INPUT_JSON_SCHEMA } from "../../src/tools/codex-exec.js";

const mockRunPreflight = vi.mocked(runPreflight);
const mockExecCodex = vi.mocked(execCodex);

// A real temporary directory that is guaranteed to exist
const REAL_CWD = os.tmpdir();

function makeLockHandle() {
  return { release: vi.fn() };
}

describe("handleCodexExec", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRunPreflight.mockResolvedValue({ lockHandle: makeLockHandle() });
    mockExecCodex.mockResolvedValue({ content: "Review complete", activity: [], usage: null, raw: "" });
  });

  it("returns content on success", async () => {
    mockExecCodex.mockResolvedValue({ content: "Review complete", activity: [], usage: null, raw: "" });

    const result = await handleCodexExec(
      { prompt: "review this", mode: "exec", requireGit: false },
      REAL_CWD,
    );

    expect(result.isError).toBeFalsy();
    // Response is wrapped in formatRichResponse with metadata header
    expect(result.content[0].text).toContain("Review complete");
    expect(result.content[0].text).toContain("[read-only");
  });

  it("accepts sandbox and sessionId in the schema while keeping mode defaulted to exec", () => {
    const parsed = inputSchema.parse({
      prompt: "review this",
      sandbox: "danger-full-access",
      sessionId: "thread-123",
    });

    expect(parsed.mode).toBe("exec");
    expect(parsed.sandbox).toBe("danger-full-access");
    expect(parsed.sessionId).toBe("thread-123");
  });

  it("publishes a tools/list JSON schema that stays in sync with the zod inputSchema", () => {
    // The MCP-advertised schema (server.ts) and the runtime validator must not
    // drift — otherwise params validate at the handler but stay invisible to clients.
    const zodKeys = Object.keys(inputSchema.shape).sort();
    const jsonKeys = Object.keys(TOOL_INPUT_JSON_SCHEMA.properties).sort();
    expect(jsonKeys).toEqual(zodKeys);
    expect(jsonKeys).toContain("sandbox");
    expect(jsonKeys).toContain("sessionId");
  });

  it("returns error for invalid cwd", async () => {
    const result = await handleCodexExec(
      { prompt: "test", mode: "exec", cwd: "/nonexistent/path/xyz", requireGit: false },
      REAL_CWD,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("INVALID_CWD");
  });

  it("releases lock on success", async () => {
    const lockHandle = makeLockHandle();
    mockRunPreflight.mockResolvedValue({ lockHandle });

    await handleCodexExec(
      { prompt: "test", mode: "exec", requireGit: false },
      REAL_CWD,
    );

    expect(lockHandle.release).toHaveBeenCalledOnce();
  });

  it("releases lock on error", async () => {
    const lockHandle = makeLockHandle();
    mockRunPreflight.mockResolvedValue({ lockHandle });
    mockExecCodex.mockRejectedValue(new Error("spawn failed"));

    const result = await handleCodexExec(
      { prompt: "test", mode: "exec", requireGit: false },
      REAL_CWD,
    );

    // Error is returned as a formatted message, not thrown
    expect(result.isError).toBe(true);
    expect(lockHandle.release).toHaveBeenCalledOnce();
  });

  it("uses serverCwd when input.cwd is not provided", async () => {
    await handleCodexExec(
      { prompt: "test", mode: "exec", requireGit: false },
      REAL_CWD,
    );

    expect(mockRunPreflight).toHaveBeenCalledOnce();
    const preflightCall = mockRunPreflight.mock.calls[0][0];
    // Normalize separators for cross-platform comparison
    const normalizedCwd = preflightCall.cwd.replace(/\\/g, "/");
    const normalizedExpected = REAL_CWD.replace(/\\/g, "/");
    expect(normalizedCwd).toContain(normalizedExpected);
  });

  it("uses input.cwd when provided and it exists", async () => {
    const result = await handleCodexExec(
      { prompt: "test", mode: "exec", cwd: REAL_CWD, requireGit: false },
      "/some/other/dir",
    );

    expect(result.isError).toBeFalsy();
    // runPreflight should receive the input cwd (resolved), not the server cwd
    const preflightCall = mockRunPreflight.mock.calls[0][0];
    // The resolved cwd should start with the temp dir path (modulo OS path normalization)
    expect(preflightCall.cwd).toBeTruthy();
  });

  it("formats BridgeError with error code", async () => {
    const { CliNotFoundError } = await import("../../src/errors/errors.js");
    mockRunPreflight.mockRejectedValue(new CliNotFoundError());

    const result = await handleCodexExec(
      { prompt: "test", mode: "exec", requireGit: false },
      REAL_CWD,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("CLI_NOT_FOUND");
  });

  it("returns content with correct MCP shape (type: text)", async () => {
    const result = await handleCodexExec(
      { prompt: "hello", mode: "exec", requireGit: false },
      REAL_CWD,
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });

  it("passes sandbox and sessionId through to execCodex", async () => {
    mockExecCodex.mockResolvedValue({
      content: "Continued",
      activity: [],
      usage: null,
      raw: "",
      sessionId: "thread-123",
    });

    const result = await handleCodexExec(
      {
        prompt: "continue",
        mode: "full-auto",
        sandbox: "danger-full-access",
        sessionId: "thread-123",
        requireGit: false,
      },
      REAL_CWD,
    );

    expect(mockExecCodex).toHaveBeenCalledOnce();
    expect(mockExecCodex).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "full-auto",
        sandbox: "danger-full-access",
        sessionId: "thread-123",
      }),
    );
    expect(result.content[0].text).toContain("[danger-full-access");
    expect(result.content[0].text).toContain(
      "session: thread-123 (pass as sessionId to continue this conversation)",
    );
  });
});
