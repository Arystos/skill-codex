import { mkdir, writeFile } from "node:fs/promises";
import {
  RESULTS_DIR,
  RESULTS_JSON,
  RESULTS_MD,
  MODE_SINGLE,
  MODE_CROSS,
} from "./src/constants.js";
import { loadCorpus } from "./src/corpus.js";
import { runMode } from "./src/harness.js";
import { scoreMode, compareModes } from "./src/scorer.js";
import { buildReport, renderMarkdown } from "./src/report.js";
import { makeMockReviewer } from "./src/reviewers/mock-reviewer.js";
import {
  commandReviewerFromEnv,
  notConfiguredReviewer,
} from "./src/reviewers/live-reviewer.js";
import type { Reviewer } from "./src/reviewers/types.js";
import type { CaseOutcome, ModeResult } from "./src/types.js";

/**
 * CLI entry point for `npm run eval`.
 *
 * Default (no flags): runs the MOCK reviewers in two modes and writes a report.
 * This verifies the whole pipeline end-to-end with zero cost and zero model
 * calls — and the output is clearly labeled as plumbing-only.
 *
 * `--live`: runs the live reviewer(s) configured via REVIEWER_CMD (single mode)
 * and, if REVIEWER_CMD_CROSS is also set, a second cross-model reviewer. With no
 * REVIEWER_CMD set, --live refuses to run (no silent paid calls).
 */

interface CliOptions {
  readonly live: boolean;
  readonly parallel: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const flags = new Set(argv);
  return {
    live: flags.has("--live"),
    parallel: flags.has("--parallel"),
  };
}

function logProgress(label: string) {
  return (outcome: CaseOutcome, index: number, total: number) => {
    const mark = outcome.caught ? "caught " : "MISSED ";
    process.stdout.write(
      `  [${String(index + 1).padStart(2)}/${total}] ${label} ${mark} ${outcome.caseId}\n`,
    );
  };
}

/**
 * Resolve the two reviewers (baseline + candidate) for the requested run.
 * In mock mode we model a realistic asymmetry WITHOUT fabricating per-bug
 * results: the single-model reviewer is given a blind spot (it suppresses one
 * rule category and adds noise), while the cross-model reviewer composes both
 * — so it inherits the union of what each catches. The numbers fall out of
 * these toy rules deterministically; they are not hardcoded outcomes.
 */
function resolveMockReviewers(): { single: Reviewer; cross: Reviewer } {
  // Single model: blind to async/null-style deref nuance + noisy.
  const single = makeMockReviewer({
    reviewer: "mock:single",
    blindSpots: ["null-undefined", "error-handling"],
    addNoise: true,
  });

  // A second, differently-biased model: blind to a DIFFERENT category.
  const other = makeMockReviewer({
    reviewer: "mock:other",
    blindSpots: ["off-by-one"],
  });

  // Cross-model = union of the two models' findings (the skill-codex premise:
  // two different families rarely share a blind spot). We concatenate their
  // review texts so the grader sees whatever EITHER model surfaced.
  const cross: Reviewer = async (input) => {
    const [a, b] = await Promise.all([single(input), other(input)]);
    return Object.freeze({
      text: `${a.text}\n\n--- second reviewer (${b.reviewer}) ---\n\n${b.text}`,
      reviewer: "mock:cross (single+other)",
    });
  };

  return { single, cross };
}

function resolveLiveReviewers(): { single: Reviewer; cross: Reviewer | null } {
  const single = commandReviewerFromEnv() ?? notConfiguredReviewer;
  const crossRaw = process.env.REVIEWER_CMD_CROSS?.trim();
  let cross: Reviewer | null = null;
  if (crossRaw) {
    cross = commandReviewerFromEnv({
      ...process.env,
      REVIEWER_CMD: crossRaw,
      REVIEWER_ID: process.env.REVIEWER_ID_CROSS ?? "cross",
    });
  }
  return { single, cross };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const concurrency = opts.parallel ? "parallel" : "sequential";

  const corpus = await loadCorpus();
  process.stdout.write(
    `\nLoaded ${corpus.length} bug cases.\n` +
      `Mode: ${opts.live ? "LIVE (paid reviewer)" : "MOCK (plumbing only — not a model measurement)"}\n\n`,
  );

  const { single, cross } = opts.live
    ? resolveLiveReviewers()
    : resolveMockReviewers();

  process.stdout.write(`Running ${MODE_SINGLE}...\n`);
  const singleResult = await runMode(corpus, single, {
    mode: MODE_SINGLE,
    concurrency,
    onProgress: logProgress(MODE_SINGLE),
  });

  let crossResult: ModeResult | null = null;
  if (cross) {
    process.stdout.write(`\nRunning ${MODE_CROSS}...\n`);
    crossResult = await runMode(corpus, cross, {
      mode: MODE_CROSS,
      concurrency,
      onProgress: logProgress(MODE_CROSS),
    });
  } else {
    process.stdout.write(
      `\nNo cross-model reviewer configured (set REVIEWER_CMD_CROSS) — single mode only.\n`,
    );
  }

  const modeScores = [scoreMode(singleResult)];
  if (crossResult) modeScores.push(scoreMode(crossResult));

  const comparison = crossResult
    ? compareModes(singleResult, crossResult)
    : null;

  const report = buildReport(modeScores, comparison, corpus.length);
  const markdown = renderMarkdown(report);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(RESULTS_MD, markdown, "utf8");

  process.stdout.write(`\n${markdown}\n`);
  process.stdout.write(`\nWrote ${RESULTS_JSON}\n`);
  process.stdout.write(`Wrote ${RESULTS_MD}\n`);
}

main().catch((err) => {
  process.stderr.write(
    `\n[eval] Failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
