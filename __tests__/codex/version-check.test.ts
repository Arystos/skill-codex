import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/codex/cli.js", () => ({ runCodexCommand: vi.fn() }));

import { runCodexCommand } from "../../src/codex/cli.js";
import {
  parseCodexVersion,
  compareVersions,
  getInstalledCodexVersion,
  codexVersionNotice,
  takeCodexVersionNotice,
  resetVersionCache,
} from "../../src/codex/version-check.js";

const mockRun = vi.mocked(runCodexCommand);

describe("parseCodexVersion", () => {
  it("extracts the semver from `codex --version` output", () => {
    expect(parseCodexVersion("codex-cli 0.163.0\n")).toBe("0.163.0");
    expect(parseCodexVersion("codex-cli 0.164.0-alpha.3")).toBe("0.164.0");
    expect(parseCodexVersion("garbage")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by major, minor, patch", () => {
    expect(compareVersions("0.163.0", "0.163.0")).toBe(0);
    expect(compareVersions("0.164.0", "0.163.9")).toBeGreaterThan(0);
    expect(compareVersions("0.163.1", "0.163.0")).toBeGreaterThan(0);
    expect(compareVersions("0.99.0", "0.163.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "0.999.0")).toBeGreaterThan(0);
  });
});

describe("codexVersionNotice", () => {
  it("is null for the verified version and for patch-level differences", () => {
    expect(codexVersionNotice("0.163.0", "0.163.0")).toBeNull();
    expect(codexVersionNotice("0.163.2", "0.163.0")).toBeNull();
  });

  it("flags a newer minor version", () => {
    const notice = codexVersionNotice("0.170.0", "0.163.0");
    expect(notice).toContain("codex-cli 0.170.0 is newer than 0.163.0");
    expect(notice).toContain("skill-codex doctor");
  });

  it("flags an older minor version with an update hint", () => {
    const notice = codexVersionNotice("0.150.0", "0.163.0");
    expect(notice).toContain("older");
    expect(notice).toContain("npm i -g @openai/codex");
  });
});

describe("getInstalledCodexVersion / takeCodexVersionNotice", () => {
  beforeEach(() => {
    resetVersionCache();
    mockRun.mockReset();
  });

  it("caches the installed version", async () => {
    mockRun.mockResolvedValue({ ok: true, stdout: "codex-cli 0.163.0", stderr: "" });
    expect(await getInstalledCodexVersion()).toBe("0.163.0");
    expect(await getInstalledCodexVersion()).toBe("0.163.0");
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith(["--version"]);
  });

  it("returns null when codex --version fails", async () => {
    mockRun.mockResolvedValue({ ok: false, stdout: "", stderr: "not found" });
    expect(await getInstalledCodexVersion()).toBeNull();
  });

  it("hands out the notice only once per process", async () => {
    mockRun.mockResolvedValue({ ok: true, stdout: "codex-cli 0.199.0", stderr: "" });
    expect(await takeCodexVersionNotice()).toContain("0.199.0");
    expect(await takeCodexVersionNotice()).toBeNull();
  });

  it("returns null when the version is unknown", async () => {
    mockRun.mockResolvedValue({ ok: false, stdout: "", stderr: "" });
    expect(await takeCodexVersionNotice()).toBeNull();
  });
});
