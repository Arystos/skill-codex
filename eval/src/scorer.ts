import { RATE_PRECISION } from "./constants.js";
import type {
  CaseOutcome,
  CategoryScore,
  Comparison,
  ModeResult,
  ModeScore,
} from "./types.js";

/**
 * Scoring: turn graded outcomes into per-category and overall metrics, and
 * compute the head-to-head delta between two modes — the "noticeable
 * improvement" number the eval exists to produce.
 *
 * Pure functions throughout. Given the same outcomes, the same scores come out.
 */

/** Round to RATE_PRECISION decimals, avoiding -0 and floating fuzz. */
function round(n: number): number {
  const f = 10 ** RATE_PRECISION;
  return Math.round(n * f) / f || 0;
}

/** Safe ratio: 0/0 is reported as 0, not NaN. */
function ratio(num: number, den: number): number {
  return den === 0 ? 0 : round(num / den);
}

/** Group outcomes by their category, preserving first-seen order. */
function groupByCategory(
  outcomes: readonly CaseOutcome[],
): readonly CategoryScore[] {
  const order: string[] = [];
  const totals = new Map<string, number>();
  const caught = new Map<string, number>();

  for (const o of outcomes) {
    if (!totals.has(o.category)) {
      order.push(o.category);
      totals.set(o.category, 0);
      caught.set(o.category, 0);
    }
    totals.set(o.category, (totals.get(o.category) ?? 0) + 1);
    if (o.caught) caught.set(o.category, (caught.get(o.category) ?? 0) + 1);
  }

  return Object.freeze(
    order.map((category): CategoryScore => {
      const total = totals.get(category) ?? 0;
      const c = caught.get(category) ?? 0;
      return Object.freeze({
        category,
        total,
        caught: c,
        catchRate: ratio(c, total),
      });
    }),
  );
}

/** Aggregate one mode's outcomes into a ModeScore. */
export function scoreMode(result: ModeResult): ModeScore {
  const { outcomes } = result;
  const total = outcomes.length;
  const caught = outcomes.filter((o) => o.caught).length;
  const missed = total - caught;
  const extraSum = outcomes.reduce((acc, o) => acc + o.extraFindings, 0);

  return Object.freeze({
    mode: result.mode,
    reviewer: result.reviewer,
    total,
    caught,
    missed,
    overallCatchRate: ratio(caught, total),
    falsePositiveRate: ratio(extraSum, total),
    byCategory: groupByCategory(outcomes),
  });
}

/** Set of case ids the mode caught. */
function caughtIds(result: ModeResult): Set<string> {
  return new Set(result.outcomes.filter((o) => o.caught).map((o) => o.caseId));
}

/**
 * Compare a candidate mode (e.g. cross-model) against a baseline (single-model).
 * Both must cover the same set of case ids, or the comparison is meaningless —
 * we throw rather than silently compare mismatched corpora.
 */
export function compareModes(
  baseline: ModeResult,
  candidate: ModeResult,
): Comparison {
  const baseIds = new Set(baseline.outcomes.map((o) => o.caseId));
  const candIds = new Set(candidate.outcomes.map((o) => o.caseId));
  if (baseIds.size !== candIds.size || [...baseIds].some((id) => !candIds.has(id))) {
    throw new Error(
      "Cannot compare modes: baseline and candidate ran on different case sets.",
    );
  }

  const baseScore = scoreMode(baseline);
  const candScore = scoreMode(candidate);

  const baseCaught = caughtIds(baseline);
  const candCaught = caughtIds(candidate);

  const newlyCaught = [...candCaught].filter((id) => !baseCaught.has(id)).sort();
  const regressed = [...baseCaught].filter((id) => !candCaught.has(id)).sort();

  return Object.freeze({
    baseline: baseScore,
    candidate: candScore,
    catchRateDelta: round(candScore.overallCatchRate - baseScore.overallCatchRate),
    newlyCaught: Object.freeze(newlyCaught),
    regressed: Object.freeze(regressed),
    falsePositiveDelta: round(
      candScore.falsePositiveRate - baseScore.falsePositiveRate,
    ),
  });
}
