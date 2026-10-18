import type { Comparison, EvalReport, ModeScore } from "./types.js";

/**
 * Report rendering: build the structured EvalReport and a human-readable
 * markdown summary. Rendering is a pure transformation of scores — no I/O here;
 * run-eval.ts owns writing files.
 */

/** Format a 0..1 rate as a percentage string with one decimal. */
function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** Format a signed delta as a percentage-point string, e.g. "+16.7pp". */
function ppDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(1)}pp`;
}

/** Assemble the structured report object. */
export function buildReport(
  modes: readonly ModeScore[],
  comparison: Comparison | null,
  corpusSize: number,
  now: Date = new Date(),
): EvalReport {
  return Object.freeze({
    generatedAt: now.toISOString(),
    corpusSize,
    modes: Object.freeze([...modes]),
    comparison,
  });
}

function renderModeTable(mode: ModeScore): string {
  const header = [
    `### ${mode.mode} — \`${mode.reviewer}\``,
    "",
    `- Overall catch rate: **${pct(mode.overallCatchRate)}** (${mode.caught}/${mode.total} bugs caught, ${mode.missed} missed)`,
    `- False-positive proxy: ${mode.falsePositiveRate.toFixed(2)} extra findings/case`,
    "",
    "| Category | Caught | Total | Catch rate |",
    "| --- | --- | --- | --- |",
  ];
  const rows = mode.byCategory.map(
    (c) => `| ${c.category} | ${c.caught} | ${c.total} | ${pct(c.catchRate)} |`,
  );
  return [...header, ...rows].join("\n");
}

function renderComparison(cmp: Comparison): string {
  const lines = [
    "## Cross-model vs single-model",
    "",
    `**Catch-rate delta: ${ppDelta(cmp.catchRateDelta)}** ` +
      `(single-model ${pct(cmp.baseline.overallCatchRate)} → cross-model ${pct(cmp.candidate.overallCatchRate)})`,
    "",
    `- Bugs newly caught by cross-model (missed by single-model): ${cmp.newlyCaught.length}` +
      (cmp.newlyCaught.length ? `\n  - ${cmp.newlyCaught.join("\n  - ")}` : ""),
    `- Regressions (caught by single-model, missed by cross-model): ${cmp.regressed.length}` +
      (cmp.regressed.length ? `\n  - ${cmp.regressed.join("\n  - ")}` : ""),
    `- False-positive delta: ${cmp.falsePositiveDelta >= 0 ? "+" : ""}${cmp.falsePositiveDelta.toFixed(2)} extra findings/case`,
  ];
  return lines.join("\n");
}

/** Render the full markdown summary for results.md. */
export function renderMarkdown(report: EvalReport): string {
  const parts: string[] = [
    "# skill-codex cross-model review eval — results",
    "",
    `Generated: ${report.generatedAt}`,
    `Corpus size: ${report.corpusSize} seeded bugs`,
    "",
    "> These numbers reflect whichever reviewers were run. With the MOCK reviewer",
    "> they only verify the harness plumbing and are NOT a claim about any model.",
    "> Real numbers require the live reviewer (see eval/README.md).",
    "",
    "## Per-mode results",
    "",
    ...report.modes.map(renderModeTable).flatMap((t) => [t, ""]),
  ];

  if (report.comparison) {
    parts.push(renderComparison(report.comparison), "");
  }

  return parts.join("\n");
}
