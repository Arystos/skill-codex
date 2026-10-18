import { SEVERITY_KEYWORDS } from "./constants.js";
import type { BugCase, CaseOutcome, ReviewOutput } from "./types.js";

/**
 * The grader. Decides, deterministically and explainably, whether a review
 * identified the seeded bug.
 *
 * A bug counts as CAUGHT when BOTH hold:
 *   1. the review text mentions the location (>=1 locationSignal), AND
 *   2. the review text contains >= minSignalHits of the expectedSignals.
 *
 * Requiring a location hit prevents a vague "there might be a null somewhere"
 * from scoring on a null-deref case it never actually located. Requiring signal
 * phrases prevents merely echoing the function name from counting. This is a
 * keyword/substring grader, chosen for determinism and zero cost — its known
 * weaknesses (paraphrase misses, no semantic understanding) are documented in
 * eval/README.md. It is intentionally the same grader for every reviewer, so
 * the single-model vs cross-model comparison is apples-to-apples.
 */

/** Case-insensitive substring test. */
function contains(haystack: string, needle: string): boolean {
  return haystack.includes(needle.toLowerCase());
}

/** Return the subset of `phrases` that appear in `text` (deduplicated). */
function matchedPhrases(text: string, phrases: readonly string[]): string[] {
  const found = phrases.filter((p) => contains(text, p));
  return [...new Set(found)];
}

/**
 * Count distinct severity-tagged findings in a review, as a coarse proxy for
 * how many things it flagged. Each occurrence of a severity keyword is counted;
 * this over-counts a single multi-line finding but is consistent across
 * reviewers, which is what the comparison needs.
 */
export function countSeverityFindings(text: string): number {
  const lower = text.toLowerCase();
  return SEVERITY_KEYWORDS.reduce((acc, kw) => {
    // Count word-boundary-ish occurrences to avoid matching substrings like
    // "lower" containing "low".
    const re = new RegExp(`\\b${kw}\\b`, "g");
    const hits = lower.match(re);
    return acc + (hits ? hits.length : 0);
  }, 0);
}

/**
 * Grade one review against one bug case. Pure function: no I/O, no mutation.
 */
export function gradeCase(bugCase: BugCase, review: ReviewOutput): CaseOutcome {
  const text = review.text.toLowerCase();

  const matchedSignals = matchedPhrases(text, bugCase.expectedSignals);
  const matchedLocations = matchedPhrases(text, bugCase.locationSignals);

  const locationHit = matchedLocations.length > 0;
  const signalHit = matchedSignals.length >= bugCase.minSignalHits;
  const caught = locationHit && signalHit;

  // "Extra findings" = severity findings beyond the one we expect them to raise
  // for the seeded bug. Clamp at zero so a review that only finds the real bug
  // (or stays silent) never reports negative noise.
  const totalFindings = countSeverityFindings(review.text);
  const extraFindings = caught ? Math.max(0, totalFindings - 1) : totalFindings;

  return Object.freeze({
    caseId: bugCase.id,
    category: bugCase.category,
    caught,
    matchedSignals: Object.freeze(matchedSignals),
    locationHit,
    extraFindings,
  });
}
