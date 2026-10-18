import type { ReviewerInput, ReviewOutput } from "../types.js";
import type { Reviewer } from "./types.js";

/**
 * MOCK reviewer — for testing the HARNESS PLUMBING ONLY. It produces NO real
 * review and is NOT a measurement of any model. Its findings are derived from
 * shallow, language-agnostic heuristics over the diff text, plus an explicit
 * `blindSpots` set of categories it pretends to "miss". This lets us:
 *   - exercise every code path (caught / missed / false-positive / verdict),
 *   - demonstrate a single-model vs cross-model DELTA in `npm run eval`,
 * WITHOUT making paid model calls and WITHOUT reading the answer key.
 *
 * Crucially, the mock NEVER inspects case.bug / expectedSignals — it only sees
 * the diff text and its own configured rules. The numbers it produces are
 * therefore a property of these toy rules, not a claim about Claude or Codex.
 * Real numbers come from the live reviewer (see live-reviewer.ts + README).
 */

/** A heuristic rule: if the diff matches, emit a finding with these phrases. */
interface HeuristicRule {
  /** Bug category this rule is meant to surface (used by blindSpots). */
  readonly category: string;
  /** Regexes over the raw diff that trigger the rule. */
  readonly triggers: readonly RegExp[];
  /** Severity label the finding is reported under. */
  readonly severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  /** The finding sentence. Phrasing aims to hit the manifest signals honestly. */
  readonly message: (input: ReviewerInput) => string;
}

/**
 * Shallow rules a "decent but not deep" reviewer might apply. They look at
 * surface patterns in the ADDED lines of the diff (lines starting with "+").
 * They are intentionally imperfect — some bugs have no trigger here at all,
 * which is realistic: not every defect is pattern-matchable.
 */
const RULES: readonly HeuristicRule[] = [
  {
    category: "security-injection",
    triggers: [/`SELECT .*\$\{/i, /query\(\s*`[^`]*\$\{/i],
    severity: "CRITICAL",
    message: (c) =>
      `SQL injection: user input is interpolated into the query string in ${c.file}; use a parameterized/bound query instead of string concatenation.`,
  },
  {
    category: "security-path-traversal",
    triggers: [/join\([^)]*,\s*name\s*\)/i],
    severity: "CRITICAL",
    message: (c) =>
      `Path traversal: the user-controlled name is joined without sanitization in ${c.file}, so "../" can escape the base directory; validate the resolved path stays inside it.`,
  },
  {
    category: "null-undefined",
    triggers: [/\.address\.\w+/, /(?<!\?)\.\w+\.\w+\b/],
    severity: "HIGH",
    message: (c) =>
      `Possible undefined dereference in ${c.file}: an optional value appears to be read without a null check; this may throw when it is undefined.`,
  },
  {
    category: "off-by-one",
    triggers: [/page\s*\*\s*size/],
    severity: "HIGH",
    message: (c) =>
      `Off-by-one in pagination (${c.file}): a 1-based page used as a 0-based offset skips the first window; start should be (page - 1) * size.`,
  },
  {
    category: "error-handling",
    triggers: [/catch\s*\{/, /catch\s*\(\s*\)\s*\{/],
    severity: "MEDIUM",
    message: (c) =>
      `Errors are swallowed in ${c.file}: a bare catch hides failures and returns null, so callers cannot tell a failed request from an empty body; let errors propagate.`,
  },
];

/** Configuration for a mock reviewer instance. */
export interface MockConfig {
  /** Identity string surfaced in the report (e.g. "mock:single"). */
  readonly reviewer: string;
  /**
   * Categories this reviewer is blind to: matching rules are suppressed, so the
   * bug is "missed". Models this idea: a single model has blind spots that a
   * different model family does not share.
   */
  readonly blindSpots?: readonly string[];
  /**
   * If true, append one generic low-severity nit to every review regardless of
   * the seeded bug. Used to exercise the false-positive accounting path.
   */
  readonly addNoise?: boolean;
}

/** Extract the added ("+") lines from a unified diff as one searchable string. */
function addedLines(diffText: string): string {
  return diffText
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
}

function deriveVerdict(
  findings: readonly { severity: string }[],
): ReviewOutput["verdict"] {
  if (findings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH")) {
    return "BLOCKED";
  }
  if (findings.length > 0) return "WARNING";
  return "APPROVED";
}

/**
 * Build a mock Reviewer from a config. Pure factory: returns a function that
 * itself performs no I/O and no mutation.
 */
export function makeMockReviewer(config: MockConfig): Reviewer {
  const blind = new Set(config.blindSpots ?? []);

  return async (input: ReviewerInput): Promise<ReviewOutput> => {
    const added = addedLines(input.diffText);

    const findings = RULES.filter(
      (rule) =>
        !blind.has(rule.category) &&
        rule.triggers.some((re) => re.test(added)),
    ).map((rule) => ({
      severity: rule.severity,
      line: `${rule.severity} — ${input.file}\n${rule.message(input)}`,
    }));

    const noiseLine = config.addNoise
      ? ["LOW — style: consider adding a brief doc comment to the changed function."]
      : [];

    const body = [...findings.map((f) => f.line), ...noiseLine];
    const text =
      body.length > 0
        ? body.join("\n\n")
        : "APPROVED — no substantive issues found in the diff.";

    return Object.freeze({
      text,
      verdict: deriveVerdict(findings),
      reviewer: config.reviewer,
    });
  };
}
