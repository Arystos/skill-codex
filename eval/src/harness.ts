import { gradeCase } from "./matcher.js";
import { toReviewerInput } from "./types.js";
import type { LoadedCase, ModeResult, CaseOutcome } from "./types.js";
import type { Reviewer } from "./reviewers/types.js";

/**
 * The harness: run one Reviewer across the whole corpus and grade each result.
 *
 * It is the model-agnostic engine — give it any Reviewer (mock or live) and the
 * loaded corpus, and it returns a ModeResult of graded outcomes. No I/O beyond
 * what the Reviewer itself does; no mutation; deterministic given a
 * deterministic reviewer.
 */

export interface RunOptions {
  /** Logical mode label for the report, e.g. "single-model". */
  readonly mode: string;
  /**
   * Run reviews sequentially (default) or concurrently. Live reviewers that
   * shell out to a paid CLI should usually stay sequential to respect rate
   * limits and keep cost predictable; the mock can run either way.
   */
  readonly concurrency?: "sequential" | "parallel";
  /**
   * Optional progress callback, invoked after each case is graded. Lets the CLI
   * stream "[3/12] caught" lines without the harness knowing about stdout.
   */
  readonly onProgress?: (outcome: CaseOutcome, index: number, total: number) => void;
}

async function runSequential(
  corpus: readonly LoadedCase[],
  reviewer: Reviewer,
  onProgress: RunOptions["onProgress"],
): Promise<CaseOutcome[]> {
  const outcomes: CaseOutcome[] = [];
  for (let i = 0; i < corpus.length; i++) {
    const loadedCase = corpus[i];
    const review = await reviewer(toReviewerInput(loadedCase));
    const outcome = gradeCase(loadedCase, review);
    outcomes.push(outcome);
    onProgress?.(outcome, i, corpus.length);
  }
  return outcomes;
}

async function runParallel(
  corpus: readonly LoadedCase[],
  reviewer: Reviewer,
  onProgress: RunOptions["onProgress"],
): Promise<CaseOutcome[]> {
  const reviews = await Promise.all(
    corpus.map((c) => reviewer(toReviewerInput(c))),
  );
  return corpus.map((loadedCase, i) => {
    const outcome = gradeCase(loadedCase, reviews[i]);
    onProgress?.(outcome, i, corpus.length);
    return outcome;
  });
}

/**
 * Run a reviewer over the corpus and return graded outcomes for the mode.
 * The reviewer name is taken from the first review (all reviews in a run share
 * one reviewer identity).
 */
export async function runMode(
  corpus: readonly LoadedCase[],
  reviewer: Reviewer,
  options: RunOptions,
): Promise<ModeResult> {
  if (corpus.length === 0) {
    throw new Error("Cannot run eval over an empty corpus.");
  }

  // Probe the reviewer identity from the first case without double-running it:
  // we run the first case, capture identity, then run the rest.
  const firstReview = await reviewer(toReviewerInput(corpus[0]));
  const reviewerId = firstReview.reviewer;
  const firstOutcome = gradeCase(corpus[0], firstReview);
  options.onProgress?.(firstOutcome, 0, corpus.length);

  const rest = corpus.slice(1);
  const restOutcomes =
    rest.length === 0
      ? []
      : options.concurrency === "parallel"
        ? await runParallel(rest, reviewer, (o, i, total) =>
            options.onProgress?.(o, i + 1, total + 1),
          )
        : await runSequential(rest, reviewer, (o, i, total) =>
            options.onProgress?.(o, i + 1, total + 1),
          );

  return Object.freeze({
    mode: options.mode,
    reviewer: reviewerId,
    outcomes: Object.freeze([firstOutcome, ...restOutcomes]),
  });
}
