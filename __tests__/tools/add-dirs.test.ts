import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveAddDirs } from "../../src/tools/add-dirs.js";

describe("resolveAddDirs", () => {
  let root: string;
  let ws: string;
  let sibling: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-adddirs-"));
    ws = path.join(root, "packages", "app");
    sibling = path.join(root, "packages", "shared lib");
    fs.mkdirSync(ws, { recursive: true });
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(root, "file.txt"), "x");
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps absolute directories and resolves relative ones against cwd", () => {
    const result = resolveAddDirs([sibling, "../shared lib", ".."], ws);
    expect(result).toEqual({ ok: true, dirs: [sibling, path.join(root, "packages")] });
  });

  it("returns an empty list for no entries", () => {
    expect(resolveAddDirs([], ws)).toEqual({ ok: true, dirs: [] });
  });

  it("rejects a missing directory", () => {
    const result = resolveAddDirs(["../does-not-exist"], ws);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not an existing directory");
  });

  it("rejects a file", () => {
    const result = resolveAddDirs([path.join(root, "file.txt")], ws);
    expect(result.ok).toBe(false);
  });

  it("rejects shell metacharacters before touching the filesystem", () => {
    const result = resolveAddDirs(["../x&calc"], ws);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("unsafe to pass to codex");
  });
});
