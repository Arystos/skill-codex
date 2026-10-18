import { describe, it, expect } from "vitest";
import { gradeCase, countSeverityFindings } from "../src/matcher.js";
import type { BugCase, ReviewOutput } from "../src/types.js";

const baseCase: BugCase = {
  id: "demo-null",
  diff: "cases/demo.diff",
  language: "typescript",
  category: "null-undefined",
  file: "src/profile.ts",
  line: 10,
  title: "optional deref",
  bug: "reads .city without checking address",
  correctReviewShouldFlag: "address may be undefined",
  expectedSignals: ["undefined", "null check", "optional"],
  locationSignals: ["address", "formatLocation", "profile"],
  minSignalHits: 1,
};

function review(text: string, reviewer = "test"): ReviewOutput {
  return { text, reviewer };
}

describe("gradeCase", () => {
  it("marks caught when location and signal both hit", () => {
    const out = gradeCase(
      baseCase,
      review("In formatLocation, address may be undefined — add a null check."),
    );
    expect(out.caught).toBe(true);
    expect(out.locationHit).toBe(true);
    expect(out.matchedSignals).toContain("undefined");
  });

  it("does NOT catch when only the location is named (no signal)", () => {
    const out = gradeCase(
      baseCase,
      review("The formatLocation function looks clean and readable."),
    );
    expect(out.caught).toBe(false);
    expect(out.locationHit).toBe(true);
  });

  it("does NOT catch when a signal appears but the location does not", () => {
    const out = gradeCase(
      baseCase,
      review("Somewhere there may be an undefined value, unclear where."),
    );
    expect(out.caught).toBe(false);
    expect(out.locationHit).toBe(false);
  });

  it("is case-insensitive", () => {
    const out = gradeCase(
      baseCase,
      review("ADDRESS may be UNDEFINED in FORMATLOCATION"),
    );
    expect(out.caught).toBe(true);
  });

  it("respects minSignalHits > 1", () => {
    const strict: BugCase = { ...baseCase, minSignalHits: 2 };
    const oneSignal = gradeCase(strict, review("address may be undefined"));
    expect(oneSignal.caught).toBe(false);
    const twoSignals = gradeCase(
      strict,
      review("address may be undefined; add a null check (optional)"),
    );
    expect(twoSignals.caught).toBe(true);
  });

  it("deduplicates matched signals", () => {
    const out = gradeCase(
      baseCase,
      review("address undefined undefined undefined in formatLocation"),
    );
    expect(out.matchedSignals.filter((s) => s === "undefined")).toHaveLength(1);
  });

  it("returns a frozen outcome (immutability)", () => {
    const out = gradeCase(baseCase, review("address undefined formatLocation"));
    expect(Object.isFrozen(out)).toBe(true);
  });
});

describe("extraFindings accounting", () => {
  it("counts severity findings beyond the seeded bug when caught", () => {
    const text =
      "HIGH — address may be undefined in formatLocation.\n" +
      "MEDIUM — unrelated style nit.\n" +
      "LOW — another unrelated suggestion.";
    const out = gradeCase(baseCase, review(text));
    expect(out.caught).toBe(true);
    // 3 severity findings total, minus the 1 seeded bug = 2 extra.
    expect(out.extraFindings).toBe(2);
  });

  it("counts all severity findings as extra when the bug is missed", () => {
    const text = "MEDIUM — unrelated.\nLOW — also unrelated.";
    const out = gradeCase(baseCase, review(text));
    expect(out.caught).toBe(false);
    expect(out.extraFindings).toBe(2);
  });

  it("never reports negative extras", () => {
    const out = gradeCase(
      baseCase,
      review("address undefined formatLocation — no severity tags here"),
    );
    expect(out.caught).toBe(true);
    expect(out.extraFindings).toBeGreaterThanOrEqual(0);
  });
});

describe("countSeverityFindings", () => {
  it("counts each severity keyword occurrence", () => {
    expect(countSeverityFindings("CRITICAL x\nHIGH y\nMEDIUM z")).toBe(3);
  });

  it("does not match severity keywords inside other words", () => {
    // "lower" contains "low", "highlight" contains "high" — must not count.
    expect(countSeverityFindings("the lower highlight critically")).toBe(0);
  });

  it("returns 0 for text with no severity tags", () => {
    expect(countSeverityFindings("looks fine to me")).toBe(0);
  });
});
