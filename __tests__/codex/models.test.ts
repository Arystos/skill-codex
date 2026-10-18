import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("../../src/codex/cli.js", () => ({ runCodexCommand: vi.fn() }));

import { runCodexCommand } from "../../src/codex/cli.js";
import {
  parseModelCatalog,
  listAvailableModels,
  readConfiguredModel,
  describeModelsForTool,
  resetModelCache,
} from "../../src/codex/models.js";

const mockRun = vi.mocked(runCodexCommand);

const CATALOG = {
  models: [
    { slug: "gpt-5.6-luna", description: "Older fast and efficient model.", visibility: "list", priority: 9 },
    { slug: "gpt-6-luna", description: "Fast and affordable model for easier tasks.", visibility: "list", priority: 4 },
    { slug: "codex-auto-review", description: "Automatic approval review model.", visibility: "hide", priority: 43 },
    { slug: "bad slug; rm -rf", description: "injected", visibility: "list", priority: 1 },
    { description: "no slug", visibility: "list", priority: 2 },
    "not an object",
  ],
};

describe("parseModelCatalog", () => {
  it("keeps listed models with safe slugs, sorted by priority", () => {
    expect(parseModelCatalog(CATALOG)).toEqual([
      { slug: "gpt-6-luna", description: "Fast and affordable model for easier tasks." },
      { slug: "gpt-5.6-luna", description: "Older fast and efficient model." },
    ]);
  });

  it("accepts a bare array and tolerates junk", () => {
    expect(parseModelCatalog([{ slug: "m1", visibility: "list" }])).toEqual([{ slug: "m1", description: "" }]);
    expect(parseModelCatalog(null)).toEqual([]);
    expect(parseModelCatalog({ models: "nope" })).toEqual([]);
  });

  it("truncates very long descriptions", () => {
    const [m] = parseModelCatalog([{ slug: "m1", visibility: "list", description: "x".repeat(500) }]);
    expect(m?.description.length).toBeLessThanOrEqual(120);
  });
});

describe("listAvailableModels", () => {
  beforeEach(() => {
    resetModelCache();
    mockRun.mockReset();
  });

  it("runs `codex debug models` once and caches the result", async () => {
    mockRun.mockResolvedValue({ ok: true, stdout: JSON.stringify(CATALOG), stderr: "" });
    const first = await listAvailableModels();
    const second = await listAvailableModels();
    expect(first.map((m) => m.slug)).toEqual(["gpt-6-luna", "gpt-5.6-luna"]);
    expect(second).toBe(first);
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith(["debug", "models"]);
  });

  it("returns [] without caching when the command fails or prints junk", async () => {
    mockRun.mockResolvedValueOnce({ ok: false, stdout: "", stderr: "boom" });
    expect(await listAvailableModels()).toEqual([]);
    mockRun.mockResolvedValueOnce({ ok: true, stdout: "not json", stderr: "" });
    expect(await listAvailableModels()).toEqual([]);
    expect(mockRun).toHaveBeenCalledTimes(2);
  });
});

describe("readConfiguredModel", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "sc-codex-home-"));
    vi.stubEnv("CODEX_HOME", home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("reads the top-level model key", () => {
    fs.writeFileSync(path.join(home, "config.toml"), 'model = "gpt-6-luna"\nmodel_reasoning_effort = "medium"\n');
    expect(readConfiguredModel()).toBe("gpt-6-luna");
  });

  it("ignores model keys inside tables", () => {
    fs.writeFileSync(path.join(home, "config.toml"), '[profiles.fast]\nmodel = "gpt-5.6-luna"\n');
    expect(readConfiguredModel()).toBeNull();
  });

  it("returns null when the file is missing", () => {
    expect(readConfiguredModel()).toBeNull();
  });
});

describe("describeModelsForTool", () => {
  it("lists models and the configured default", () => {
    const text = describeModelsForTool(
      [
        { slug: "gpt-6-luna", description: "Fast." },
        { slug: "gpt-5.6-terra", description: "Balanced." },
      ],
      "gpt-6-luna",
    );
    expect(text).toContain("- gpt-6-luna: Fast. (user's default)");
    expect(text).toContain("- gpt-5.6-terra: Balanced.");
  });

  it("returns an empty string when no models are known", () => {
    expect(describeModelsForTool([], "gpt-6-luna")).toBe("");
  });
});
