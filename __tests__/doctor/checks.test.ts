import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("../../src/codex/cli.js", () => ({ runCodexCommand: vi.fn(), runCommand: vi.fn() }));
vi.mock("../../src/codex/models.js", () => ({ listAvailableModels: vi.fn(), readConfiguredModel: vi.fn() }));
vi.mock("../../src/codex/version-check.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/codex/version-check.js")>()),
  getInstalledCodexVersion: vi.fn(),
}));
vi.mock("../../src/install/detect.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/install/detect.js")>()),
  detectInstall: vi.fn(),
}));

import { runCodexCommand, runCommand } from "../../src/codex/cli.js";
import { listAvailableModels, readConfiguredModel } from "../../src/codex/models.js";
import { getInstalledCodexVersion } from "../../src/codex/version-check.js";
import { detectInstall } from "../../src/install/detect.js";
import {
  checkAuth,
  checkBuild,
  checkCodex,
  checkInstall,
  checkModels,
  checkNode,
  checkSandbox,
  checkUpdate,
  runDoctor,
} from "../../src/doctor/checks.js";
import { WINDOWS_SANDBOX_ENV } from "../../src/config/constants.js";

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(process, "platform", original);
  }
}

describe("checkBuild", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-build-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("warns when there is no build", () => {
    expect(checkBuild({ version: "1.0.0", root, builtAt: null }).status).toBe("warn");
  });

  it("warns when src is newer than dist and points to /mcp Reconnect", () => {
    fs.mkdirSync(path.join(root, "src", "deep"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "deep", "a.ts"), "");
    const result = checkBuild({ version: "1.0.0", root, builtAt: new Date(0) });
    expect(result.status).toBe("warn");
    expect(result.hint).toContain("/mcp");
  });

  it("is ok for a fresh build or an installed package without src", () => {
    expect(checkBuild({ version: "1.0.0", root, builtAt: new Date() }).status).toBe("ok");
  });
});

describe("checkNode", () => {
  it("requires Node 20+", () => {
    expect(checkNode("18.20.0").status).toBe("fail");
    expect(checkNode("20.0.0").status).toBe("ok");
  });
});

describe("checkCodex", () => {
  it("fails when codex is missing, warns on a new minor, ok on the verified one", async () => {
    vi.mocked(getInstalledCodexVersion).mockResolvedValueOnce(null);
    expect((await checkCodex()).status).toBe("fail");
    vi.mocked(getInstalledCodexVersion).mockResolvedValueOnce("0.199.0");
    expect((await checkCodex()).status).toBe("warn");
    vi.mocked(getInstalledCodexVersion).mockResolvedValueOnce("0.163.0");
    expect((await checkCodex()).detail).toContain("codex-cli 0.163.0");
  });
});

describe("checkModels", () => {
  const models = [
    { slug: "gpt-6-luna", description: "" },
    { slug: "gpt-5.6-terra", description: "" },
  ];

  it("warns when the catalog can't be read", async () => {
    vi.mocked(listAvailableModels).mockResolvedValueOnce([]);
    expect((await checkModels()).status).toBe("warn");
  });

  it("fails when the configured default isn't on the account", async () => {
    vi.mocked(listAvailableModels).mockResolvedValueOnce(models);
    vi.mocked(readConfiguredModel).mockReturnValueOnce("gpt-5.6-sol");
    const result = await checkModels();
    expect(result.status).toBe("fail");
    expect(result.hint).toContain("gpt-6-luna, gpt-5.6-terra");
  });

  it("lists the models and the default", async () => {
    vi.mocked(listAvailableModels).mockResolvedValueOnce(models);
    vi.mocked(readConfiguredModel).mockReturnValueOnce(null);
    expect((await checkModels()).detail).toBe("gpt-6-luna, gpt-5.6-terra · default: Codex's built-in");
  });
});

describe("checkAuth", () => {
  const failed = (message: string): string => JSON.stringify({ type: "turn.failed", error: { message } });

  it("is ok when a turn completes", async () => {
    vi.mocked(runCodexCommand).mockResolvedValueOnce({ ok: true, stdout: '{"type":"turn.completed","usage":{}}', stderr: "" });
    expect((await checkAuth()).status).toBe("ok");
  });

  it("points to codex login on auth failures", async () => {
    vi.mocked(runCodexCommand).mockResolvedValueOnce({
      ok: false,
      stdout: failed("workspace routing discovery unauthorized (401)"),
      stderr: "",
    });
    expect((await checkAuth()).hint).toContain("codex login");
  });

  it("points to the models check when the default model is rejected", async () => {
    const api = JSON.stringify({ status: 400, error: { type: "invalid_request_error", message: "The 'x' model is not supported." } });
    vi.mocked(runCodexCommand).mockResolvedValueOnce({ ok: false, stdout: failed(api), stderr: "" });
    const result = await checkAuth();
    expect(result.detail).toBe("The 'x' model is not supported.");
    expect(result.hint).toContain("models check");
  });

  it("falls back to the last stderr line", async () => {
    vi.mocked(runCodexCommand).mockResolvedValueOnce({ ok: false, stdout: "", stderr: "a\nspawn failed\n" });
    expect((await checkAuth()).detail).toBe("spawn failed");
    vi.mocked(runCodexCommand).mockResolvedValueOnce({ ok: false, stdout: "", stderr: "" });
    expect((await checkAuth()).detail).toBe("no response from Codex");
  });
});

describe("checkSandbox", () => {
  it("skips outside Windows", () => {
    expect(withPlatform("linux", () => checkSandbox()).status).toBe("skip");
  });

  it("is ok for elevated, naming where the mode came from", () => {
    const result = withPlatform("win32", () => checkSandbox({ mode: "elevated", source: "config" }));
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("windows.sandbox=elevated (~/.codex/config.toml)");
  });

  it("warns that unelevated can't run builds or tests", () => {
    const result = withPlatform("win32", () => checkSandbox({ mode: "unelevated", source: "default" }));
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("can't run builds or tests");
    expect(result.hint).toContain('sandbox = "elevated"');
  });

  it("warns for mxc and for an invalid override", () => {
    expect(withPlatform("win32", () => checkSandbox({ mode: "mxc", source: "env" })).detail).toContain("git commands fail");
    const invalid = withPlatform("win32", () =>
      checkSandbox({ mode: "elevated", source: "config", invalidOverride: "bogus" }),
    );
    expect(invalid.detail).toContain("bogus is not a valid mode");
  });
});

describe("checkInstall", () => {
  const root = path.resolve("/pkg");
  const setupServer = { command: "node", args: [path.join(root, "dist", "index.js")] };
  const none = { setupServer: null, pluginIds: [], disabledInProjects: [], projectScopes: [] as ("local" | "project")[] };

  it("fails when nothing is registered", () => {
    expect(checkInstall(none, "/w", root).status).toBe("fail");
  });

  it("warns when installed both ways", () => {
    const result = checkInstall({ ...none, setupServer, pluginIds: ["skill-codex@skill-codex"] }, "/w", root);
    expect(result.detail).toContain("installed twice");
  });

  it("warns when disabled for the current project", () => {
    const state = { ...none, setupServer, disabledInProjects: [path.resolve("/w")] };
    expect(checkInstall(state, "/w/sub", root).detail).toContain("disabled for this project");
  });

  it("warns when setup points at another build", () => {
    const state = { ...none, setupServer: { command: "node", args: [path.resolve("/other/dist/index.js")] } };
    expect(checkInstall(state, "/w", root).detail).toContain("not this build");
  });

  it("accepts a project-scoped registration", () => {
    expect(checkInstall({ ...none, projectScopes: ["project", "local"] }, "/w", root)).toEqual({
      name: "install",
      status: "ok",
      detail: "project .mcp.json + local scope",
    });
  });

  it("suggests claude mcp add when nothing is registered", () => {
    expect(checkInstall(none, "/w", root).hint).toContain("claude mcp add --scope user skill-codex");
  });

  it("is ok for a matching setup or a plugin", () => {
    expect(checkInstall({ ...none, setupServer }, "/w", root).status).toBe("ok");
    expect(checkInstall({ ...none, pluginIds: ["skill-codex@skill-codex"] }, "/w", root).detail).toBe(
      "plugin skill-codex@skill-codex",
    );
  });
});

describe("checkUpdate", () => {
  it("skips when npm is unreachable", async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({ ok: false, stdout: "", stderr: "offline" });
    expect((await checkUpdate("0.8.1")).status).toBe("skip");
  });

  it("warns when a newer release exists", async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({ ok: true, stdout: "0.9.0\n", stderr: "" });
    expect((await checkUpdate("0.8.1")).detail).toBe("skill-codex 0.9.0 is available (running 0.8.1)");
  });

  it("is ok when current", async () => {
    vi.mocked(runCommand).mockResolvedValueOnce({ ok: true, stdout: "0.8.1\n", stderr: "" });
    expect((await checkUpdate("0.8.1")).status).toBe("ok");
  });
});

describe("runDoctor", () => {
  beforeEach(() => {
    vi.mocked(runCodexCommand).mockClear();
    vi.mocked(getInstalledCodexVersion).mockResolvedValue("0.163.0");
    vi.mocked(listAvailableModels).mockResolvedValue([{ slug: "m1", description: "" }]);
    vi.mocked(readConfiguredModel).mockReturnValue("m1");
    vi.mocked(detectInstall).mockReturnValue({ setupServer: null, pluginIds: ["skill-codex@x"], disabledInProjects: [], projectScopes: [] });
  });

  it("skips live checks offline", async () => {
    const results = await runDoctor({ offline: true });
    expect(results.map((r) => r.name)).toEqual(["build", "node", "codex", "install", "sandbox", "models", "auth", "update"]);
    expect(results.slice(-2).every((r) => r.status === "skip")).toBe(true);
    expect(runCodexCommand).not.toHaveBeenCalledWith(expect.arrayContaining(["exec"]), expect.anything());
  });

  it("runs the live checks otherwise", async () => {
    vi.mocked(runCodexCommand).mockResolvedValueOnce({ ok: true, stdout: '{"type":"turn.completed"}', stderr: "" });
    vi.mocked(runCommand).mockResolvedValueOnce({ ok: true, stdout: "0.0.1", stderr: "" });
    const results = await runDoctor();
    expect(results.find((r) => r.name === "auth")?.status).toBe("ok");
    expect(results.find((r) => r.name === "update")?.status).toBe("ok");
  });
});
