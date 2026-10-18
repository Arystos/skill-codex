import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getVersion, getBuildInfo, formatBuildInfo } from "../../src/config/version.js";

describe("version", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-version-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads the version from package.json", () => {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));
    expect(getVersion(root)).toBe("1.2.3");
  });

  it("falls back to 0.0.0 when package.json is missing or has no string version", () => {
    expect(getVersion(root)).toBe("0.0.0");
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: 7 }));
    expect(getVersion(root)).toBe("0.0.0");
  });

  it("reports the real repo version by default", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8")) as { version: string };
    expect(getVersion()).toBe(pkg.version);
  });

  it("reports builtAt from dist/index.js, or null when not built", () => {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
    expect(getBuildInfo(root).builtAt).toBeNull();

    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "index.js"), "");
    const info = getBuildInfo(root);
    expect(info.builtAt).toBeInstanceOf(Date);
    expect(info.version).toBe("1.0.0");
  });

  it("formats build info for logs", () => {
    const at = new Date("2026-10-18T10:00:00.000Z");
    expect(formatBuildInfo({ version: "1.0.0", root: "/x", builtAt: at })).toBe(
      "skill-codex v1.0.0 (built 2026-10-18T10:00:00.000Z) from /x",
    );
    expect(formatBuildInfo({ version: "1.0.0", root: "/x", builtAt: null })).toBe(
      "skill-codex v1.0.0 (not built) from /x",
    );
  });
});
