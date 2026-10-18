import { describe, it, expect } from "vitest";
import { validateManifest, loadManifest } from "../src/manifest.js";

function validCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "demo-bug",
    diff: "cases/demo.diff",
    language: "typescript",
    category: "off-by-one",
    file: "src/x.ts",
    line: 3,
    title: "t",
    bug: "b",
    correctReviewShouldFlag: "f",
    expectedSignals: ["off by one"],
    locationSignals: ["paginate"],
    minSignalHits: 1,
    ...overrides,
  };
}

function validManifest(cases = [validCase()]) {
  return { version: 1, cases };
}

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    const m = validateManifest(validManifest());
    expect(m.version).toBe(1);
    expect(m.cases).toHaveLength(1);
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.cases[0])).toBe(true);
  });

  it("rejects a missing required field", () => {
    const bad = validManifest([validCase({ file: undefined })]);
    expect(() => validateManifest(bad)).toThrow(/Invalid eval manifest/);
  });

  it("rejects an unknown language", () => {
    const bad = validManifest([validCase({ language: "rust" })]);
    expect(() => validateManifest(bad)).toThrow(/language/);
  });

  it("rejects a non-kebab-case id", () => {
    const bad = validManifest([validCase({ id: "Demo_Bug" })]);
    expect(() => validateManifest(bad)).toThrow(/Invalid eval manifest/);
  });

  it("rejects a non-positive line number", () => {
    const bad = validManifest([validCase({ line: 0 })]);
    expect(() => validateManifest(bad)).toThrow(/Invalid eval manifest/);
  });

  it("rejects empty expectedSignals", () => {
    const bad = validManifest([validCase({ expectedSignals: [] })]);
    expect(() => validateManifest(bad)).toThrow(/Invalid eval manifest/);
  });

  it("rejects minSignalHits greater than the number of signals", () => {
    const bad = validManifest([
      validCase({ expectedSignals: ["a"], minSignalHits: 2 }),
    ]);
    expect(() => validateManifest(bad)).toThrow(/minSignalHits/);
  });

  it("rejects unknown extra properties (strict)", () => {
    const bad = validManifest([validCase({ surprise: true })]);
    expect(() => validateManifest(bad)).toThrow(/Invalid eval manifest/);
  });

  it("rejects duplicate case ids", () => {
    const dup = validManifest([validCase(), validCase()]);
    expect(() => validateManifest(dup)).toThrow(/Duplicate case id/);
  });

  it("rejects an empty cases array", () => {
    expect(() => validateManifest({ version: 1, cases: [] })).toThrow(
      /Invalid eval manifest/,
    );
  });
});

describe("loadManifest (real corpus on disk)", () => {
  it("loads and validates the shipped manifest", async () => {
    const m = await loadManifest();
    expect(m.cases.length).toBeGreaterThanOrEqual(12);
  });

  it("every shipped case has a unique id", async () => {
    const m = await loadManifest();
    const ids = m.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("throws a clear error when the file is missing", async () => {
    await expect(loadManifest("does-not-exist.json")).rejects.toThrow(
      /Could not read eval manifest/,
    );
  });
});
