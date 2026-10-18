import { describe, it, expect } from "vitest";
import { scoreMode, compareModes } from "../src/scorer.js";
import type { CaseOutcome, ModeResult } from "../src/types.js";

function outcome(
  caseId: string,
  category: string,
  caught: boolean,
  extraFindings = 0,
): CaseOutcome {
  return {
    caseId,
    category,
    caught,
    matchedSignals: [],
    locationHit: caught,
    extraFindings,
  };
}

function modeResult(
  mode: string,
  reviewer: string,
  outcomes: CaseOutcome[],
): ModeResult {
  return { mode, reviewer, outcomes };
}

describe("scoreMode", () => {
  it("computes overall catch rate", () => {
    const result = modeResult("single-model", "mock", [
      outcome("a", "off-by-one", true),
      outcome("b", "null-undefined", false),
      outcome("c", "off-by-one", true),
      outcome("d", "security", false),
    ]);
    const score = scoreMode(result);
    expect(score.total).toBe(4);
    expect(score.caught).toBe(2);
    expect(score.missed).toBe(2);
    expect(score.overallCatchRate).toBe(0.5);
  });

  it("computes per-category catch rate, preserving first-seen order", () => {
    const result = modeResult("single-model", "mock", [
      outcome("a", "off-by-one", true),
      outcome("b", "null-undefined", false),
      outcome("c", "off-by-one", false),
    ]);
    const score = scoreMode(result);
    expect(score.byCategory.map((c) => c.category)).toEqual([
      "off-by-one",
      "null-undefined",
    ]);
    const offByOne = score.byCategory.find((c) => c.category === "off-by-one");
    expect(offByOne).toMatchObject({ total: 2, caught: 1, catchRate: 0.5 });
  });

  it("computes false-positive rate as mean extra findings per case", () => {
    const result = modeResult("single-model", "mock", [
      outcome("a", "x", true, 2),
      outcome("b", "x", true, 0),
    ]);
    const score = scoreMode(result);
    expect(score.falsePositiveRate).toBe(1); // (2 + 0) / 2
  });

  it("handles an all-missed mode without NaN", () => {
    const result = modeResult("single-model", "mock", [
      outcome("a", "x", false),
    ]);
    const score = scoreMode(result);
    expect(score.overallCatchRate).toBe(0);
    expect(Number.isNaN(score.overallCatchRate)).toBe(false);
  });

  it("returns a frozen score (immutability)", () => {
    const score = scoreMode(
      modeResult("m", "mock", [outcome("a", "x", true)]),
    );
    expect(Object.isFrozen(score)).toBe(true);
    expect(Object.isFrozen(score.byCategory)).toBe(true);
  });
});

describe("compareModes", () => {
  const baseline = modeResult("single-model", "mock:single", [
    outcome("a", "off-by-one", true, 1),
    outcome("b", "null-undefined", false),
    outcome("c", "security", true),
    outcome("d", "async-race", false),
  ]);

  const candidate = modeResult("cross-model", "mock:cross", [
    outcome("a", "off-by-one", true),
    outcome("b", "null-undefined", true), // newly caught
    outcome("c", "security", true),
    outcome("d", "async-race", false),
  ]);

  it("computes the catch-rate delta", () => {
    const cmp = compareModes(baseline, candidate);
    // baseline 2/4 = 0.5, candidate 3/4 = 0.75 → +0.25
    expect(cmp.baseline.overallCatchRate).toBe(0.5);
    expect(cmp.candidate.overallCatchRate).toBe(0.75);
    expect(cmp.catchRateDelta).toBe(0.25);
  });

  it("lists newly caught and regressed bugs", () => {
    const cmp = compareModes(baseline, candidate);
    expect(cmp.newlyCaught).toEqual(["b"]);
    expect(cmp.regressed).toEqual([]);
  });

  it("detects regressions when candidate misses what baseline caught", () => {
    const regressedCandidate = modeResult("cross-model", "mock:cross", [
      outcome("a", "off-by-one", false), // regressed
      outcome("b", "null-undefined", true),
      outcome("c", "security", true),
      outcome("d", "async-race", false),
    ]);
    const cmp = compareModes(baseline, regressedCandidate);
    expect(cmp.regressed).toEqual(["a"]);
    expect(cmp.newlyCaught).toEqual(["b"]);
  });

  it("computes the false-positive delta", () => {
    const cmp = compareModes(baseline, candidate);
    // baseline fp = 1/4 = 0.25, candidate fp = 0 → delta -0.25
    expect(cmp.falsePositiveDelta).toBe(-0.25);
  });

  it("throws when modes ran on different case sets", () => {
    const mismatched = modeResult("cross-model", "mock:cross", [
      outcome("a", "off-by-one", true),
      outcome("z", "other", true),
      outcome("c", "security", true),
      outcome("d", "async-race", false),
    ]);
    expect(() => compareModes(baseline, mismatched)).toThrow(/different case/i);
  });

  it("returns a frozen comparison (immutability)", () => {
    const cmp = compareModes(baseline, candidate);
    expect(Object.isFrozen(cmp)).toBe(true);
    expect(Object.isFrozen(cmp.newlyCaught)).toBe(true);
  });
});
