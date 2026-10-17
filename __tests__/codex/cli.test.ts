import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn(), exec: vi.fn() }));
vi.mock("../../src/guards/check-binary.js", () => ({ getCachedBinaryPath: vi.fn() }));

import { exec, execFile } from "node:child_process";
import { getCachedBinaryPath } from "../../src/guards/check-binary.js";
import { runCodexCommand, runCommand, toCommandLine } from "../../src/codex/cli.js";

const mockExecFile = vi.mocked(execFile);

type Callback = (error: Error | null, stdout: string, stderr: string) => void;

/** Stub whichever spawn function this platform uses (exec on Windows, execFile elsewhere). */
function stubExecFile(error: Error | null, stdout: string, stderr: string): { end: ReturnType<typeof vi.fn> } {
  const stdin = { end: vi.fn() };
  const impl = (...params: unknown[]) => {
    const cb = params[params.length - 1] as Callback;
    setImmediate(() => cb(error, stdout, stderr));
    return { stdin } as never;
  };
  mockExecFile.mockImplementation(impl as never);
  vi.mocked(exec).mockImplementation(impl as never);
  return stdin;
}

/** The binary a stubbed call ran, from exec's command line or execFile's first arg. */
function lastBinary(): string {
  if (process.platform === "win32") return String(vi.mocked(exec).mock.calls.at(-1)?.[0]).split(" ")[0] ?? "";
  return String(mockExecFile.mock.calls.at(-1)?.[0]);
}

describe("toCommandLine", () => {
  it("joins parts and quotes the ones with whitespace", () => {
    expect(toCommandLine("C:\Program Files\codex.cmd", ["--version"])).toBe('"C:\Program Files\codex.cmd" --version');
    expect(toCommandLine("codex", ["debug", "models"])).toBe("codex debug models");
  });
});

describe("runCommand", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    vi.mocked(exec).mockReset();
  });

  it("resolves ok with output and closes stdin", async () => {
    const stdin = stubExecFile(null, "codex-cli 0.163.0", "");
    await expect(runCommand("codex", ["--version"])).resolves.toEqual({
      ok: true,
      stdout: "codex-cli 0.163.0",
      stderr: "",
    });
    expect(stdin.end).toHaveBeenCalled();
    expect(lastBinary()).toBe("codex");
  });

  it("resolves not-ok instead of throwing on failure", async () => {
    stubExecFile(new Error("spawn ENOENT"), "", "");
    await expect(runCommand("codex", ["--version"])).resolves.toEqual({
      ok: false,
      stdout: "",
      stderr: "spawn ENOENT",
    });
  });
});

describe("runCodexCommand", () => {
  it("prefers the cached codex path", async () => {
    vi.mocked(getCachedBinaryPath).mockReturnValue("/opt/codex");
    stubExecFile(null, "", "");
    await runCodexCommand(["debug", "models"]);
    expect(lastBinary()).toBe("/opt/codex");
  });
});
