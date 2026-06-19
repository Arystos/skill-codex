import { describe, it, expect, afterEach, vi } from "vitest";
import { getSandboxConfigArgs } from "../../src/runner/sandbox-args.js";
import { WINDOWS_SANDBOX_ENV } from "../../src/config/constants.js";

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
  });

  it("returns no args on non-Windows platforms", () => {
    withPlatform("linux", () => {
      expect(getSandboxConfigArgs()).toEqual([]);
    });
    withPlatform("darwin", () => {
      expect(getSandboxConfigArgs()).toEqual([]);
    });
  });

  it("pins windows.sandbox=unelevated by default on Windows", () => {
    withPlatform("win32", () => {
      delete process.env[WINDOWS_SANDBOX_ENV];
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=unelevated"]);
    });
  });

  it("honors SKILL_CODEX_WINDOWS_SANDBOX override on Windows", () => {
    withPlatform("win32", () => {
      process.env[WINDOWS_SANDBOX_ENV] = "elevated";
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=elevated"]);
    });
  });

  it("falls back to the default when the override is blank", () => {
    withPlatform("win32", () => {
      process.env[WINDOWS_SANDBOX_ENV] = "   ";
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=unelevated"]);
    });
  });
});
