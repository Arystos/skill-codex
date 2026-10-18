import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getSandboxConfigArgs,
  getSandboxGitEnv,
  resolveWindowsSandbox,
} from "../../src/runner/sandbox-args.js";
import { WINDOWS_SANDBOX_ENV, WINDOWS_SANDBOX_MODES } from "../../src/config/constants.js";

// Every test runs against an empty CODEX_HOME, so the developer's own
// ~/.codex/config.toml can't change the result.
let codexHome: string;

beforeEach(() => {
  codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "sc-sandbox-home-"));
  vi.stubEnv("CODEX_HOME", codexHome);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(codexHome, { recursive: true, force: true });
});

function writeCodexConfig(text: string): void {
  fs.writeFileSync(path.join(codexHome, "config.toml"), text);
}

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

  it("uses windows.sandbox=unelevated when nothing is configured", () => {
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

describe("resolveWindowsSandbox", () => {
  it("prefers a valid override, then config.toml, then the default", () => {
    expect(resolveWindowsSandbox("mxc", "elevated")).toEqual({ mode: "mxc", source: "env" });
    expect(resolveWindowsSandbox(undefined, "elevated")).toEqual({ mode: "elevated", source: "config" });
    expect(resolveWindowsSandbox(undefined, null)).toEqual({ mode: "unelevated", source: "default" });
  });

  it("reports an invalid override and falls through to config.toml", () => {
    expect(resolveWindowsSandbox("bogus", "elevated")).toEqual({
      mode: "elevated",
      source: "config",
      invalidOverride: "bogus",
    });
  });

  it("ignores an unknown config.toml value", () => {
    expect(resolveWindowsSandbox(undefined, "restricted-token")).toEqual({ mode: "unelevated", source: "default" });
  });
});

describe("getSandboxConfigArgs with config.toml", () => {
  it("follows [windows] sandbox from the user's Codex config", () => {
    writeCodexConfig(['model = "m"', "[windows]", 'sandbox = "elevated"', ""].join("\n"));
    withPlatform("win32", () => {
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=elevated"]);
    });
  });

  it("lets the env override win over config.toml", () => {
    writeCodexConfig(["[windows]", 'sandbox = "elevated"', ""].join("\n"));
    vi.stubEnv(WINDOWS_SANDBOX_ENV, "unelevated");
    withPlatform("win32", () => {
      expect(getSandboxConfigArgs()).toEqual(["-c", "windows.sandbox=unelevated"]);
    });
  });
});

describe("getSandboxGitEnv", () => {
  const topLevel = (): string => "C:/repo";

  it("trusts the repo for git when the elevated backend runs commands as another account", () => {
    vi.stubEnv(WINDOWS_SANDBOX_ENV, "elevated");
    withPlatform("win32", () => {
      expect(getSandboxGitEnv("C:/repo/src", {}, topLevel)).toEqual({
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "safe.directory",
        GIT_CONFIG_VALUE_0: "C:/repo",
      });
    });
  });

  it("appends after GIT_CONFIG_* entries that are already set", () => {
    vi.stubEnv(WINDOWS_SANDBOX_ENV, "elevated");
    withPlatform("win32", () => {
      expect(getSandboxGitEnv("C:/repo", { GIT_CONFIG_COUNT: "2" }, topLevel)).toEqual({
        GIT_CONFIG_COUNT: "3",
        GIT_CONFIG_KEY_2: "safe.directory",
        GIT_CONFIG_VALUE_2: "C:/repo",
      });
    });
  });

  it("adds nothing for other modes, other platforms, or outside a git repo", () => {
    withPlatform("win32", () => {
      expect(getSandboxGitEnv("C:/repo", {}, topLevel)).toEqual({}); // default unelevated
      vi.stubEnv(WINDOWS_SANDBOX_ENV, "elevated");
      expect(getSandboxGitEnv("C:/tmp", {}, () => null)).toEqual({});
    });
    withPlatform("linux", () => {
      expect(getSandboxGitEnv("/repo", {}, topLevel)).toEqual({});
    });
  });
});
