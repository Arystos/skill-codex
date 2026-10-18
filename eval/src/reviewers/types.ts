import type { ReviewerInput, ReviewOutput } from "../types.js";

/**
 * A Reviewer reviews a single diff and returns its findings as text.
 *
 * This is the ONE seam that makes the eval honest and pluggable: the harness
 * never calls Codex or Claude directly — it calls a Reviewer. Swap in the mock
 * for plumbing tests, or the live reviewer for real numbers. Both satisfy the
 * exact same async contract.
 *
 * A Reviewer is handed only a {@link ReviewerInput} — the diff plus `id`/`file`.
 * The manifest's answer key (bug, category, expectedSignals, locationSignals…)
 * is structurally withheld, so no reviewer — shipped or custom — can grade with
 * it. Base the verdict ONLY on `input.diffText`.
 */
export type Reviewer = (input: ReviewerInput) => Promise<ReviewOutput>;

/** A named reviewer plus the logical mode it represents in the report. */
export interface ReviewerBinding {
  readonly mode: string;
  readonly reviewer: Reviewer;
}
