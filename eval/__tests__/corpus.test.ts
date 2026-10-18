import { describe, it, expect } from "vitest";
import { loadCorpus } from "../src/corpus.js";
import { runMode } from "../src/harness.js";
import { gradeCase } from "../src/matcher.js";
import { makeMockReviewer } from "../src/reviewers/mock-reviewer.js";
import { scoreMode, compareModes } from "../src/scorer.js";
import type { Reviewer } from "../src/reviewers/types.js";

describe("loadCorpus", () => {
  it("loads every case with its diff text attached", async () => {
    const corpus = await loadCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(12);
    for (const c of corpus) {
      expect(c.diffText.length).toBeGreaterThan(0);
      expect(c.diffText).toContain("diff --git");
    }
  });

  it("returns a frozen corpus (immutability)", async () => {
    const corpus = await loadCorpus();
    expect(Object.isFrozen(corpus)).toBe(true);
  });

  it("covers a mix of languages", async () => {
    const corpus = await loadCorpus();
    const langs = new Set(corpus.map((c) => c.language));
    // Corpus is designed to span TS plus at least Python and Go.
    expect(langs.has("typescript")).toBe(true);
    expect(langs.size).toBeGreaterThanOrEqual(3);
  });

  it("references the file named in each manifest entry within its diff", async () => {
    const corpus = await loadCorpus();
    for (const c of corpus) {
      expect(c.diffText).toContain(c.file);
    }
  });
});

describe("grader sanity: a perfect review catches every seeded bug", () => {
  it("an oracle review built from correctReviewShouldFlag + location is graded caught", async () => {
    const corpus = await loadCorpus();
    for (const c of corpus) {
      // Construct a review that names the location and uses the manifest's own
      // description of what a correct review should say. This proves the
      // expectedSignals are actually present in a faithful review — i.e. the
      // grader is satisfiable and not impossibly strict.
      const oracleText = `${c.locationSignals[0]}: ${c.correctReviewShouldFlag} ${c.expectedSignals.join(" ")}`;
      const outcome = gradeCase(c, { text: oracleText, reviewer: "oracle" });
      expect(outcome.caught, `case ${c.id} should be catchable`).toBe(true);
    }
  });

  it("an empty 'looks good' review catches nothing", async () => {
    const corpus = await loadCorpus();
    for (const c of corpus) {
      const outcome = gradeCase(c, {
        text: "APPROVED — looks good, no issues.",
        reviewer: "lgtm",
      });
      expect(outcome.caught, `case ${c.id} must not be a false catch`).toBe(
        false,
      );
    }
  });
});

describe("end-to-end harness with mock reviewers", () => {
  it("produces a comparison with a non-negative cross-model delta", async () => {
    const corpus = await loadCorpus();

    const single = makeMockReviewer({
      reviewer: "mock:single",
      blindSpots: ["null-undefined", "error-handling"],
      addNoise: true,
    });
    const other = makeMockReviewer({
      reviewer: "mock:other",
      blindSpots: ["off-by-one"],
    });
    const cross: Reviewer = async (c) => {
      const [a, b] = await Promise.all([single(c), other(c)]);
      return { text: `${a.text}\n\n${b.text}`, reviewer: "mock:cross" };
    };

    const singleResult = await runMode(corpus, single, { mode: "single-model" });
    const crossResult = await runMode(corpus, cross, { mode: "cross-model" });

    const cmp = compareModes(singleResult, crossResult);
    // Cross-model unions two reviewers' findings, so it cannot catch fewer than
    // the single model alone. This verifies the plumbing, not any real model.
    expect(cmp.catchRateDelta).toBeGreaterThanOrEqual(0);
    expect(cmp.regressed).toEqual([]);
  });

  it("scores are internally consistent (caught + missed == total)", async () => {
    const corpus = await loadCorpus();
    const single = makeMockReviewer({ reviewer: "mock:single" });
    const result = await runMode(corpus, single, { mode: "single-model" });
    const score = scoreMode(result);
    expect(score.caught + score.missed).toBe(score.total);
    expect(score.total).toBe(corpus.length);
  });

  it("runs identically in sequential and parallel concurrency", async () => {
    const corpus = await loadCorpus();
    const reviewer = makeMockReviewer({ reviewer: "mock:single" });
    const seq = await runMode(corpus, reviewer, {
      mode: "m",
      concurrency: "sequential",
    });
    const par = await runMode(corpus, reviewer, {
      mode: "m",
      concurrency: "parallel",
    });
    expect(scoreMode(seq).caught).toBe(scoreMode(par).caught);
  });
});
