# Cross-model review eval

> Does having a **different** model family review a diff actually catch bugs that
> single-model review waves through? This harness is how you find out — with
> numbers, not vibes.

This directory is a small, reproducible benchmark for the core claim behind
skill-codex: *two models rarely make the same mistake*. It seeds a corpus of
realistic one-bug diffs, runs them past a pluggable "reviewer", and measures how
many seeded bugs each review **catches** vs **misses**, plus a false-positive
proxy. It can compare two modes — **single-model** (one reviewer) and
**cross-model** (a different family reviewing, or two reviewers combined) — and
reports the **delta**: the "noticeable improvement" number.

## The honesty contract

This harness is a measurement *tool*. It ships with **no result numbers baked
in**, and by design it **does not make paid model or CLI calls on its own**.

- `npm run eval` (default) runs a **MOCK** reviewer. The mock produces no real
  review — it applies a handful of shallow regex rules to the diff text. Its
  output verifies the *plumbing* (loading, grading, scoring, reporting) and
  demonstrates the comparison machinery. **The mock's numbers are a property of
  those toy rules, not a claim about Claude or Codex.** Every report is labeled
  as such.
- Real numbers come from the **live reviewer**, which *you* run against your own
  Claude + Codex setup (auth, cost, and non-determinism make that your call).
  With no reviewer configured, `--live` refuses to run rather than spending your
  quota silently.

So the credibility chain is: the *harness* is verified by `npm run eval:test`
(46 vitest cases, including an oracle check that every seeded bug is catchable
and a "looks good" check that nothing is a false catch); the *numbers* are
whatever your configured reviewer actually produces.

## Layout

```
eval/
├── README.md                      # this file
├── run-eval.ts                    # CLI entry — `npm run eval`
├── vitest.config.ts               # scopes vitest to eval/__tests__
├── tsconfig.json                  # extends the repo tsconfig (noEmit)
├── corpus/
│   ├── manifest.json              # ground truth: one entry per seeded bug
│   ├── manifest.schema.json       # JSON Schema for the manifest
│   └── cases/                     # 12 unified-diff files (TS/JS, Python, Go)
│       ├── 01-off-by-one-pagination.diff
│       └── ... (12 total)
├── src/
│   ├── types.ts                   # readonly shapes for the whole pipeline
│   ├── constants.ts               # paths, mode labels, tunables
│   ├── manifest.ts                # zod-validated manifest loader
│   ├── corpus.ts                  # joins manifest entries with diff text
│   ├── matcher.ts                 # the grader: caught / missed / extras
│   ├── harness.ts                 # runs a reviewer across the corpus
│   ├── scorer.ts                  # per-category + overall metrics, delta
│   ├── report.ts                  # JSON + markdown rendering
│   └── reviewers/
│       ├── types.ts               # the Reviewer contract (the pluggable seam)
│       ├── mock-reviewer.ts       # MOCK — plumbing only, no model call
│       └── live-reviewer.ts       # LIVE — the real integration you run
├── __tests__/                     # vitest: matcher, scorer, manifest, corpus
└── results/                       # generated (gitignored): results.json + .md
```

## The corpus

12 cases, each a small unified diff that seeds **exactly one** subtle, *plausible*
bug — the kind a bias-to-ship model skims past. They are deliberately not
cartoonish: each looks like a reasonable change, and several carry a misleading
comment that rationalizes the defect (mirroring how real bad diffs are
"explained").

| # | Case | Language | Category | The seeded bug |
|---|------|----------|----------|----------------|
| 01 | off-by-one-pagination | TS | off-by-one | 1-based `page` used as a 0-based offset; page 1 skips the first window |
| 02 | unhandled-null-user | TS | null/undefined | optional `address` dereferenced without a guard |
| 03 | async-race-cache | TS | async/race | token refresh has no in-flight dedupe (thundering herd) |
| 04 | resource-leak-filehandle | TS | resource leak | `try/finally` removed; fd leaks if a write rejects |
| 05 | sql-injection-search | TS | security (injection) | user input interpolated into SQL |
| 06 | swallowed-error-retry | TS | error handling | blanket catch turns every failure into `null` |
| 07 | logic-inversion-access | TS | logic inversion | authorization check negated (`!(...)`) |
| 08 | missing-empty-edge-average | Python | missing edge case | empty-list guard dropped → `ZeroDivisionError` |
| 09 | integer-overflow-go | Go | integer overflow | checksum accumulator narrowed to `uint8` |
| 10 | float-money-rounding | TS | float precision | money summed in floating-point dollars |
| 11 | path-traversal-download | TS | security (path traversal) | filename sanitization removed; `../` escapes uploads |
| 12 | missing-await-validation | TS | logic inversion | duplicate-email guard un-awaited *and* inverted |

Each case has a ground-truth entry in `corpus/manifest.json`:

- `category`, `file`, `line`, `title`, `bug` — what the defect is and where.
- `correctReviewShouldFlag` — what a correct review is expected to say.
- `expectedSignals` — phrases that indicate the review named *this* defect.
- `locationSignals` — phrases that anchor the finding to the right place.
- `minSignalHits` — how many `expectedSignals` must appear.

### How a "catch" is decided (the grader)

`src/matcher.ts` grades a review against a case **deterministically**. A bug is
**caught** only when **both** hold:

1. the review mentions the **location** (≥ 1 `locationSignal`), and
2. the review contains ≥ `minSignalHits` of the `expectedSignals`.

Requiring a location hit stops a vague "there might be a null somewhere" from
scoring on a case it never located; requiring signal phrases stops merely
echoing a function name from counting. The same grader is applied to **every**
reviewer, so single-model vs cross-model is apples-to-apples.

It is a **keyword/substring grader** — chosen for determinism, zero cost, and
auditability (`matchedSignals` is recorded per case). Its limitations are real
and listed below.

### Metrics

- **Catch rate** (per category and overall): `caught / total`.
- **False-positive proxy**: mean number of *extra* severity-tagged findings per
  case beyond the one seeded bug. A coarse signal of review noise, not a precise
  precision metric (see Limitations).
- **Delta**: `crossModel.catchRate − singleModel.catchRate`, plus the specific
  bug ids **newly caught** and any **regressions**.

## Running it

### 1. Verify the harness (no model calls, no cost)

```shell
npm run eval:test
# or, equivalently:
npx vitest run --config eval/vitest.config.ts
```

> The repo's root `vitest.config.ts` scopes its `include` to `__tests__/**` (the
> package's own unit tests), so a bare `npx vitest run eval` finds nothing. The
> eval ships its own config; always pass `--config eval/vitest.config.ts` (the
> `npm run eval:test` script does this for you).

### 2. Run the mock pipeline (no model calls, no cost)

```shell
npm run eval
```

Loads the corpus, runs the MOCK reviewer in single- and cross-model modes,
prints a markdown summary, and writes `eval/results/results.json` and
`eval/results/results.md`. Every report is labeled *plumbing-only*.

### 3. Get **real** numbers (this spends your Codex / Claude quota)

Point the eval at a real reviewer via `REVIEWER_CMD`. The harness pipes each
diff to the process on stdin (wrapped in a review prompt) and treats whatever it
prints on stdout as the review text. **No manifest/answer-key data is ever sent
to the reviewer** — it sees only the diff.

**Single model (baseline) — e.g. Codex on its own:**

```shell
REVIEWER_CMD='codex exec --sandbox read-only' \
REVIEWER_ID='codex:gpt-6.1-sol' \
npm run eval -- --live
```

> The default `stdin` mode pipes the prompt+diff to the process — `codex exec`
> and `claude -p` both read instructions from stdin. **Prefer stdin** (and on
> Windows it's required): the harness runs CLIs through the shell on Windows so
> `.cmd`/`.ps1` shims resolve, and under a shell a `prompt-arg` would be
> concatenated into the command line unescaped, so `prompt-arg` + Windows is
> rejected with guidance. Increase `REVIEWER_TIMEOUT_MS` for big diffs.

**Cross-model — add a *different* family as the candidate:**

```shell
# Baseline = single model; candidate = the OTHER model (or a script that fans
# out to both and concatenates their reviews — the skill-codex pattern).
REVIEWER_CMD='codex exec --sandbox read-only'      REVIEWER_ID='codex' \
REVIEWER_CMD_CROSS='claude -p --output-format text' REVIEWER_ID_CROSS='claude' \
npm run eval -- --live
```

The report then includes the head-to-head **delta** and the list of bugs each
mode caught/missed.

**The most faithful cross-model setup** is to make the candidate command invoke
skill-codex's own review flow (Claude reading the diff, then calling Codex via
the MCP bridge, and Claude making the final call). Wrap that in a small script
that prints the combined review to stdout and set it as `REVIEWER_CMD_CROSS`.

### 4. Bring your own reviewer in code

For full control (e.g. calling the Anthropic SDK directly, or the Codex MCP tool
in-process), implement the `Reviewer` type and run the harness yourself:

```ts
import { loadCorpus } from "./src/corpus.js";
import { runMode } from "./src/harness.js";
import { scoreMode, compareModes } from "./src/scorer.js";
import type { Reviewer } from "./src/reviewers/types.js";

const myReviewer: Reviewer = async (input) => {
  // `input` is a ReviewerInput: { id, file, diffText } only. The manifest answer
  // key (bug, category, expectedSignals, locationSignals…) is structurally
  // withheld — you literally cannot read it here, so the numbers stay honest.
  const text = await callYourModel(input.diffText);
  return { text, reviewer: "my-model" };
};

const corpus = await loadCorpus();
const result = await runMode(corpus, myReviewer, { mode: "single-model" });
console.log(scoreMode(result));
```

## Methodology notes & limitations

Read these before quoting any number.

- **The mock is not a model.** Default `npm run eval` numbers measure toy rules,
  full stop. Only the live reviewer produces meaningful figures.
- **Keyword grading is approximate.** A correct review phrased entirely in
  paraphrase that avoids every `expectedSignal` would be scored as a miss (false
  negative); a review that happens to name the location and drop a signal word
  for the *wrong* reason could be scored as a catch (false positive). The
  `expectedSignals` lists are deliberately broad to reduce the former. For
  higher fidelity, swap in an LLM-as-judge grader behind the same `gradeCase`
  seam — the harness doesn't care how grading happens.
- **The false-positive proxy is coarse.** It counts severity-tagged lines, not
  genuinely-wrong findings. Treat it as a noise indicator, not precision.
- **Small corpus.** 12 cases is enough to *demonstrate* a method and surface a
  directional delta; it is not enough for a tight confidence interval. Expand
  the corpus (add diffs + manifest entries) before making strong claims, and
  run several trials per case to account for model non-determinism (the harness
  is deterministic given a deterministic reviewer; real models are not).
- **No "clean" controls yet.** Every case contains a bug, so the harness
  measures catch rate, not the false-alarm rate on correct diffs. Adding
  bug-free diffs would let you measure how often a reviewer invents problems.
- **Reviewer cannot see the answer key.** Reviewers are handed a `ReviewerInput`
  (`{ id, file, diffText }`) — the manifest's `bug`/`category`/`expectedSignals`/
  `locationSignals` are structurally withheld, not merely "please don't peek." So
  even a custom reviewer can't grade with the answer key.

## Extending the corpus

1. Add `corpus/cases/NN-short-name.diff` (a small unified diff seeding one bug).
2. Add a matching entry to `corpus/manifest.json` (validated against
   `manifest.schema.json` and by zod at load time).
3. Run `npm run eval:test` — the corpus tests check the diff exists, references
   its named file, and that the case is catchable by an oracle review and not a
   false catch by a "looks good" review.
```
