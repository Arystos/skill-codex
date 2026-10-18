import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readConfigString } from "../../src/codex/codex-config.js";

const CONFIG = `model = "gpt-6-luna"
model_reasoning_effort = "medium"
[projects.'C:\\Users\\x']
trust_level = "trusted"

[windows]
sandbox = "elevated"

[tui]
model = "not-top-level"
`;

describe("readConfigString", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "sc-codex-config-"));
    vi.stubEnv("CODEX_HOME", home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("reads top-level keys and stops at the first table", () => {
    fs.writeFileSync(path.join(home, "config.toml"), CONFIG);
    expect(readConfigString("model")).toBe("gpt-6-luna");
    expect(readConfigString("sandbox")).toBeNull();
  });

  it("reads a key inside a table, not from the next table", () => {
    fs.writeFileSync(path.join(home, "config.toml"), CONFIG);
    expect(readConfigString("sandbox", "windows")).toBe("elevated");
    expect(readConfigString("model", "windows")).toBeNull();
  });

  it("returns null for a missing table or file", () => {
    fs.writeFileSync(path.join(home, "config.toml"), CONFIG);
    expect(readConfigString("sandbox", "nope")).toBeNull();
    fs.rmSync(path.join(home, "config.toml"));
    expect(readConfigString("model")).toBeNull();
  });
});
