/**
 * Shared types for the cross-model review eval.
 *
 * All shapes are readonly: the harness never mutates a case, result, or report
 * in place — every stage returns a new object (immutable pipeline), mirroring
 * the rest of the skill-codex codebase.
 */

/** One ground-truth bug case, as declared in corpus/manifest.json. */
export interface BugCase {
  readonly id: string;
  /** Path to the .diff file, relative to corpus/manifest.json. */
  readonly diff: string;
  readonly language: "typescript" | "javascript" | "python" | "go";
  /** Bug taxonomy bucket, e.g. "off-by-one", "security-injection". */
  readonly category: string;
  readonly file: string;
  readonly line: number;
  readonly title: string;
  /** Plain-English description of the seeded defect. */
  readonly bug: string;
  /** What a correct review is expected to say. */
  readonly correctReviewShouldFlag: string;
  /** Phrases that signal the reviewer named THIS bug (the defect itself). */
  readonly expectedSignals: readonly string[];
  /** Phrases that anchor the finding to the right place in the code. */
  readonly locationSignals: readonly string[];
  /** Minimum number of expectedSignals that must appear to count as caught. */
  readonly minSignalHits: number;
}

/** A bug case joined with the loaded text of its diff. */
export interface LoadedCase extends BugCase {
  readonly diffText: string;
}

/**
 * The ONLY view a Reviewer is given of a case. Deliberately excludes every
 * ground-truth/answer-key field of {@link BugCase} (`bug`, `category`, `title`,
 * `correctReviewShouldFlag`, `expectedSignals`, `locationSignals`, `line`,
 * `minSignalHits`) so a reviewer — including a custom one — *cannot* grade with
 * the answer key. It sees only the diff (and `file`/`id`, which are already
 * derivable from the diff headers). This enforces the honesty contract
 * structurally rather than by convention.
 */
export interface ReviewerInput {
  readonly id: string;
  readonly file: string;
  readonly diffText: string;
}

/** Project a LoadedCase down to the answer-key-free view a Reviewer may see. */
export function toReviewerInput(loadedCase: LoadedCase): ReviewerInput {
  return Object.freeze({
    id: loadedCase.id,
    file: loadedCase.file,
    diffText: loadedCase.diffText,
  });
}

/**
 * A reviewer's verdict on a single diff. This is the only contract a reviewer
 * must satisfy — the mock reviewer and the live (Codex/Claude) reviewer both
 * return this shape, so the harness is agnostic to how the review was produced.
 */
export interface ReviewOutput {
  /** Free-form review text. The matcher scans this for signal phrases. */
  readonly text: string;
  /** Overall verdict, if the reviewer assigns one. Optional. */
  readonly verdict?: "APPROVED" | "WARNING" | "BLOCKED";
  /** Reviewer identity, for the report (e.g. "mock", "codex:gpt-6.1-sol"). */
  readonly reviewer: string;
}

/** Whether a reviewer caught the seeded bug, and what else it flagged. */
export interface CaseOutcome {
  readonly caseId: string;
  readonly category: string;
  /** Did the review identify the seeded bug (location + signal hits)? */
  readonly caught: boolean;
  /** Signal phrases the matcher found, for auditability. */
  readonly matchedSignals: readonly string[];
  /** Did the review anchor to the right location? */
  readonly locationHit: boolean;
  /**
   * Heuristic count of *other* severity findings the review raised that are
   * not the seeded bug. Used for a coarse false-positive-rate signal. A review
   * that flags many unrelated "issues" is noisier even when it catches the bug.
   */
  readonly extraFindings: number;
}

/** The full result of running one reviewer across the whole corpus. */
export interface ModeResult {
  /** Logical mode label: "single-model" or "cross-model". */
  readonly mode: string;
  /** The reviewer identity that produced these outcomes. */
  readonly reviewer: string;
  readonly outcomes: readonly CaseOutcome[];
}

/** Per-category catch statistics. */
export interface CategoryScore {
  readonly category: string;
  readonly total: number;
  readonly caught: number;
  readonly catchRate: number;
}

/** Aggregate metrics for one mode. */
export interface ModeScore {
  readonly mode: string;
  readonly reviewer: string;
  readonly total: number;
  readonly caught: number;
  readonly missed: number;
  readonly overallCatchRate: number;
  /** Mean extra (non-seeded) findings per case — a false-positive proxy. */
  readonly falsePositiveRate: number;
  readonly byCategory: readonly CategoryScore[];
}

/** The head-to-head comparison between two modes. */
export interface Comparison {
  readonly baseline: ModeScore;
  readonly candidate: ModeScore;
  /** candidate.overallCatchRate - baseline.overallCatchRate. */
  readonly catchRateDelta: number;
  /** Bugs caught by candidate but missed by baseline. */
  readonly newlyCaught: readonly string[];
  /** Bugs caught by baseline but missed by candidate (regressions). */
  readonly regressed: readonly string[];
  /** falsePositiveRate delta (candidate - baseline). */
  readonly falsePositiveDelta: number;
}

/** Top-level eval report, serialized to results.json. */
export interface EvalReport {
  readonly generatedAt: string;
  readonly corpusSize: number;
  readonly modes: readonly ModeScore[];
  readonly comparison: Comparison | null;
}
