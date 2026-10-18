import { describe, it, expect, afterEach, vi } from "vitest";
import { getSandboxConfigArgs } from "../../src/runner/sandbox-args.js";
import { WINDOWS_SANDBOX_ENV, WINDOWS_SANDBOX_MODES } from "../../src/config/constants.js";

/** Temporarily override process.platform (a non-writable property). */
function withPlatform(platform: NodeJS.Platform, fn: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(process, "platform", original);
  }
}

describe("getSandboxConfigArgs", () => {
  afterEach(() => {
    delete process.env[WINDOWS_SANDBOX_ENV];
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns no args on non-Windows platforms", () => {
    withPlatform("linux", () => {
      expect(getSandboxConfigArgs()).toEqual([]);
    });
    withPlatform("darwin", () => {
      expect(getSandboxConfigArgs()).toEqual([]);
    });
  });

  it("ignores the override on non-Windows platforms", () => {
    withPlatform("linux", () => {
      process.env[WINDOWS_SANDBOX_ENV] = "elevated";
      expect(getSandboxConfigArgs()).toEqual([]);
    });
  });

  it("pins windows.sandbox=unelevated by default on Windows", () => {
    withPlatform("win32", () => {
      delete process.env[WINDOWS_SANDBOX_ENV];
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=unelevated"]);
    });
  });

  it("allowlists exactly the modes Codex accepts", () => {
    expect([...WINDOWS_SANDBOX_MODES]).toEqual(["elevated", "unelevated", "mxc"]);
  });

  it.each(["elevated", "unelevated", "mxc"])("honors SKILL_CODEX_WINDOWS_SANDBOX=%s on Windows", (mode) => {
    withPlatform("win32", () => {
      process.env[WINDOWS_SANDBOX_ENV] = mode;
      expect(getSandboxConfigArgs()).toEqual(["-c", `windows.sandbox=${mode}`]);
    });
  });

  it("normalizes case and surrounding whitespace in the override", () => {
    withPlatform("win32", () => {
      process.env[WINDOWS_SANDBOX_ENV] = "  Elevated ";
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=elevated"]);
    });
  });

  it("falls back to the default when the override is blank", () => {
    withPlatform("win32", () => {
      process.env[WINDOWS_SANDBOX_ENV] = "   ";
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=unelevated"]);
    });
  });

  it.each([
    "restricted-token", // legacy/unknown name: well-formed token but not a Codex mode
    "none",
    "elevated --dangerously-bypass-approvals-and-sandbox", // shell-injection attempt
    "mxc&calc",
  ])("rejects unknown override %j and keeps the default", (value) => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    withPlatform("win32", () => {
      process.env[WINDOWS_SANDBOX_ENV] = value;
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=unelevated"]);
    });
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining(WINDOWS_SANDBOX_ENV));
  });

  it("does not warn for a valid override", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    withPlatform("win32", () => {
      process.env[WINDOWS_SANDBOX_ENV] = "mxc";
      getSandboxConfigArgs();
    });
    expect(stderr).not.toHaveBeenCalled();
  });
});
