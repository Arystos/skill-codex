import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Centralized paths and tunables for the eval. No magic values inline — this
 * mirrors the src/config/constants.ts convention in the main package.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** eval/ root (one level up from eval/src/). */
export const EVAL_ROOT = resolve(HERE, "..");

/** eval/corpus/ */
export const CORPUS_DIR = resolve(EVAL_ROOT, "corpus");

/** eval/corpus/manifest.json */
export const MANIFEST_PATH = resolve(CORPUS_DIR, "manifest.json");

/** Where run-eval.ts writes its artifacts. */
export const RESULTS_DIR = resolve(EVAL_ROOT, "results");
export const RESULTS_JSON = resolve(RESULTS_DIR, "results.json");
export const RESULTS_MD = resolve(RESULTS_DIR, "results.md");

/** Logical mode labels used in the report and comparison. */
export const MODE_SINGLE = "single-model";
export const MODE_CROSS = "cross-model";

/**
 * Severity keywords used to *coarsely* count how many distinct findings a
 * review raised, for the false-positive proxy. Counting severity headers is a
 * deliberately simple heuristic — see eval/README.md "Limitations".
 */
export const SEVERITY_KEYWORDS = [
  "critical",
  "high",
  "medium",
  "low",
  "warning",
] as const;

/** Rounding precision for reported rates. */
export const RATE_PRECISION = 4;
