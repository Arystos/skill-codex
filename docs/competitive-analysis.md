# Competitive Analysis

> **Honest take, not a sales sheet.** This document studies the competitors people name in the same breath as skill-codex — including the ones that are bigger, official, or more sophisticated — and marks clearly where skill-codex loses. The point is to know our real, defensible wedge, not to win every row.
>
> Researched June 2026. The Codex ecosystem moves fast; re-verify version-specific claims (especially the official MCP server, which is marked *Experimental*) against the Codex version we ship against.

## TL;DR

- The "subscription auth / no API key" line is **not a differentiator** versus the official Codex MCP server or the official OpenAI plugin. Both already authenticate via your `codex login` session (ChatGPT/Codex subscription, no API key). We should stop leading with it as if it were unique. (Evidence below — it's confirmed in Codex source.)
- The genuinely defensible wedge today is narrow and operational: **real Windows support that is verified in CI, with a Windows sandbox in which both git and builds work**, plus **runaway/freeze guards** and the **single-tool, low-decision MCP surface inside Claude Code**. Notably, even OpenAI's official plugin does **not** run Windows in CI. (The sandbox part of this wedge narrowed in codex-cli 0.163: the elevated-sandbox *spawn* bug, codex#24098, is fixed upstream. What remains is that the `elevated` backend runs commands as a separate account, so git rejects the user's repo as "dubious ownership", while `unelevated` blocks child processes (no builds or tests). skill-codex follows the user's backend and, under `elevated`, trusts the workspace repo for git via `GIT_CONFIG_*` env; competitors inherit the backend with neither fix. See the Windows note below.)
- The most sophisticated competitor pattern is **magpie's** multi-model review → debate → convergence → tool-verified audit. It is genuinely better *as a review engine* than our single-pass review. But it is a standalone CLI, has **no CI**, and is **effectively broken on Windows** for the Codex/Claude CLI providers. Its *ideas* are worth adopting; it is not a like-for-like substitute for an in-session Claude Code bridge.
- For one-shot "ask Codex once" calls, the **official Codex MCP is lighter** than skill-codex (fewer moving parts, fewer tokens, fewer decisions). We should concede this openly. skill-codex earns its extra weight only when you want the *workflow* (structured verdict + bounded fix→re-review loop, auto-review hook, guards, Windows reliability), not a raw passthrough.

---

## The four competitors

### 1. liliu-z/magpie — multi-model adversarial review with debate + consensus

**What it is.** A standalone Node/TypeScript CLI (`magpie review <pr>`, `magpie discuss <topic>`). Not a Claude Code plugin or MCP server — you run it in your own terminal against a GitHub PR, a branch, local changes, specific files, or a whole repo. License: ISC.

**How it works** (from `src/orchestrator/orchestrator.ts`):

1. **Analyzer** pass summarizes the PR, flags interface/compat/interaction risks, and proposes focus areas.
2. **Multi-round debate.** Round 1: every configured reviewer reviews **independently and in parallel** (no reviewer sees another's output — "fair debate model", no execution-order advantage). Round 2+: each reviewer sees **all previous rounds** and is told to either agree explicitly ("I agree with X, no additional issues" is an accepted, non-padded outcome), challenge a claim *with code evidence*, or add only concrete new issues.
3. **Convergence check** between rounds: a separate LLM "strict consensus judge" decides CONVERGED / NOT_CONVERGED and stops early when reviewers truly agree (saves tokens). Configurable `max_rounds` (default 5).
4. **Structurizer** extracts all raised issues into strict JSON (severity/category/file/line/raisedBy), constrained to changed files and valid diff line ranges.
5. **Verify + Audit** — the strongest part. A **tool-equipped** final judge (Read/Grep/Glob/Bash, runs `gh pr diff`) re-checks **every** issue against the actual code and returns a verdict per issue: `keep` / `rewrite` / `drop` (with a typed reason: codebase-convention, pre-existing, theoretically-impossible, style-out-of-scope, false-claim) / `new`. It must quote real code as `evidence` for anything it keeps, and it actively hunts for issues the reviewers *missed* (cross-file pattern repetition, untouched files, broken abstractions). Optional per-repo "house rules" override reviewer claims.
6. Optional summarizer conclusion; interactive per-issue posting to the PR as inline GitHub comments.

**What's genuinely good.** The independent-then-debate structure with a strict convergence judge is a real anti-groupthink design. The tool-equipped verify/audit step that drops false positives and demands code-quoted evidence is more rigorous than a single review pass. It supports CLI providers (claude-code, codex-cli, gemini-cli, qwen-code) on subscription auth **and** API providers, per-provider session memory to cut tokens across rounds, parallel execution, token/cost tracking, and resumable sessions.

**Where it's weak (honestly).** It's a heavyweight separate tool, not an in-Claude-Code experience — you leave your session to run it. Multi-round multi-model debate is **expensive** (many model calls per review). Critically for our audience: **no CI at all** (no `.github/workflows`), and its CLI providers spawn `codex`/`claude` with bare `spawn()` — **no `shell:true`, no `windowsHide`** — so on Windows, where `codex`/`claude` are `.cmd`/`.ps1` shims, execution fails with ENOENT. Its only nod to Windows is `where` vs `which` in the binary existence check. So magpie is effectively **Windows-broken for the very CLI providers it recommends**. License is ISC; author/keywords blank; version 1.0.0.

### 2. openai/codex-plugin-cc — OpenAI's official Codex plugin for Claude Code

**What it is.** The **official** OpenAI plugin (Apache-2.0, `author: OpenAI`, v1.0.4) to use Codex from inside Claude Code. Installed via `/plugin marketplace add openai/codex-plugin-cc`. This is the single most important competitor: it's official, it's the default thing people will reach for, and it overlaps heavily with us.

**How it works.** It does **not** use MCP. It wraps the **Codex app server** (`codex app-server`, a JSON-RPC-over-stdio protocol) via its own Node "broker" that can keep one shared Codex runtime alive across calls. Commands:
- `/codex:review` — normal read-only Codex review of current changes or branch-vs-base (`--base`), supports `--background` / `--wait`.
- `/codex:adversarial-review` — a **steerable** "break confidence in this change" review with a typed attack surface (auth, data loss, rollback, races, version skew…), emits structured JSON.
- `/codex:rescue` — delegate a task to Codex via a `codex-rescue` subagent (`--model`, `--effort`, `--resume`, `--fresh`, `--background`).
- `/codex:status`, `/codex:result`, `/codex:cancel` — manage background jobs; `/codex:result` surfaces the Codex session id so you can `codex resume` in Codex directly.
- `/codex:setup` — checks/install/login, and toggles an optional **review gate** (a `Stop` hook, ALLOW/BLOCK, 900s timeout) that runs a Codex review of Claude's last turn and blocks stopping if it finds issues.

**Auth.** Uses your **local Codex CLI auth** — ChatGPT subscription (incl. Free) **or** API key. It auto-detects which (`account.type === "chatgpt"` vs `"apiKey"`). So "no API key" is true here too.

**Structured output.** It ships a real JSON schema (`review-output.schema.json`): `verdict` ∈ {approve, needs-attention}, plus findings with severity/title/body/file/line_start/line_end/**confidence (0–1)**/recommendation, and `next_steps`. This is *more* structured than our APPROVED/WARNING/BLOCKED text contract, and it already does the `--output-schema` thing we have in our icebox.

**Windows.** This is the nuance that matters for our positioning. codex-plugin-cc **does** have Windows code paths — it spawns with `shell: process.platform === "win32" ? (process.env.SHELL || true) : false`, `windowsHide: true`, and a `terminateProcessTree` using `taskkill /T /F` (the same family of techniques we use). **But:** (a) its CI is `runs-on: ubuntu-latest` only — **no Windows job**, so Windows is "should work," not "verified"; and (b) it does **not** pin a Codex Windows sandbox backend, so it inherits the user's `[windows] sandbox` setting. *Update, re-tested on codex-cli 0.163.0:* the elevated-sandbox spawn failure ([codex#24098](https://github.com/openai/codex/issues/24098)) that originally motivated our `windows.sandbox=unelevated` pin is fixed upstream, so that particular exposure is gone. The pin was later dropped: under `unelevated`, child processes fail with EPERM, so Codex can't run builds or tests (#26). Under `elevated`, Codex runs commands as a separate local account (`CodexSandboxOffline`), and git refuses the user's repo with "detected dubious ownership" unless `safe.directory` trusts it — skill-codex now sets that for the Codex process only. Under `mxc`, `git status` fails. So our Windows edge over the *official* plugin is real but narrower than "they're Linux-only": it's **"verified in CI + a sandbox where git and builds work"** vs their **"coded for Windows, untested, and dependent on the user's sandbox backend."**

**Where it beats us.** It's official (trust, longevity, tracks the Codex protocol natively via the app server rather than scraping `codex exec` output). Background/async jobs with status/cancel. Steerable adversarial review. Confidence-scored structured schema. Shared-runtime broker (potentially fewer cold starts than spawning `codex exec` per call). One direction only (Codex-from-Claude), which is the same direction we do — the "bidirectional" angle commenters raised is about magpie, not this.

### 3. The official Codex MCP server (`codex mcp-server`)

**What it is.** The Codex CLI's own built-in MCP server, registered straight into Claude Code:
```
claude mcp add codex -- codex mcp-server -c model=... -c reasoning_effort=... -c approval_policy=never -c sandbox_mode=danger-full-access
```
This is the "why do I need your wrapper at all?" competitor. A commenter's claim: it's **lighter-weight** — fewer tokens, fewer decisions — than skill-codex. **That claim is largely correct for one-shot use.** It's the official binary exposing itself over MCP with zero extra layer; Claude calls one Codex tool, Codex runs with the config flags you pinned, done. No wrapper process, no slash commands, no hook, no lock files, no fix→re-review loop — and correspondingly fewer tokens and fewer decision points per call.

**How it authenticates (the key verification).** It uses the **same `codex login` session** as the interactive CLI — i.e. your ChatGPT/Codex **subscription** (OAuth) credentials in `~/.codex/auth.json`. **No `OPENAI_API_KEY` required.** This is confirmed in Codex source: the native MCP server builds its auth via `AuthManager::shared_from_config(config, /*enable_codex_api_key_env*/ false)` — the *same* auth manager the main CLI uses, and with the API-key-env path explicitly **disabled**, so it relies on the stored login (which can be `AuthMode::Chatgpt`). The `mcp-server` crate depends on `codex-core` + `codex-login`, i.e. the standard auth stack.

> Caveat worth stating: the prose docs don't spell this out in one quotable sentence (it's established from the source + the general auth model), and `codex mcp-server` is marked **Experimental**, so treat exact flags as version-dependent.

**Where it's weaker than us.** It's a raw passthrough. No structured verdict, no bounded fix→re-review loop, no auto-review hook, no anti-recursion/lock/timeout guards beyond Codex's own, no smart diff filtering to protect your quota, no `/codex-review|do|consult` ergonomics. And the example registration pins `approval_policy=never` + `sandbox_mode=danger-full-access` — i.e. it hands Codex full access by default, which most people shouldn't do casually; we default to read-only.

### 4. GitHub Codex code review (`@codex review`)

**What it is.** OpenAI's **cloud, server-side** PR reviewer — the counterpart to CodeRabbit or the Claude GitHub app, not a local tool. You connect your GitHub repo to Codex at `chatgpt.com/codex`, set up Codex cloud for the repo, and toggle on **Code review**.

**How it works.** It reviews the PR **diff entirely in OpenAI's cloud** (its own sandbox), can navigate the codebase and run code/tests, then posts a **native GitHub review** with inline comments. Triggers either **automatically** on PR open (if enabled) or **on demand** via an `@codex review` comment (reacts 👀, posts the review). Findings are deliberately filtered to **P0/P1** (regressions, missing tests, doc gaps); review guidance is customizable via an `AGENTS.md` "Review guidelines" section. After review, `@codex fix it` spins up a **new cloud task** that pushes a fix commit. Requires a paid ChatGPT plan (Plus/Pro/Business/Edu/Enterprise) with GitHub connected.

**Why it's barely a competitor (different layer).** It runs in the cloud, on **already-pushed PRs only** — it cannot see local uncommitted changes, can't run before you open a PR, sends your diff to OpenAI's servers, and is asynchronous. skill-codex runs **locally, in-session, on your working tree, before you commit**. They're complementary stages (pre-commit local vs post-push CI-style), not substitutes. Worth a one-line "use both" note in our docs, not a feature war.

---

## Feature comparison

Honest marks. ✅ = yes / strong; ⚠️ = partial / qualified; ❌ = no / loses. Rows where skill-codex is **not** ahead are called out plainly.

| Capability | skill-codex | magpie | codex-plugin-cc (official) | Codex MCP (`codex mcp-server`) | GitHub `@codex review` |
|---|---|---|---|---|---|
| **Subscription auth, no API key** | ✅ | ✅ (CLI providers) | ✅ (ChatGPT or API key) | ✅ (same `codex login`) | ✅ (ChatGPT plan) |
| → *Is this a skill-codex differentiator?* | **❌ No** — everyone here does it | — | — | — | — |
| **Windows works without WSL** | ✅ (shell+windowsHide, sandbox from the user's Codex config) | ❌ bare spawn, ENOENT on `.cmd` shims | ⚠️ coded for Windows, inherits user's sandbox backend | ⚠️ inherits Codex CLI and the user's sandbox backend | ✅ (cloud, OS-irrelevant) |
| **Windows verified in CI** | ✅ 9-way matrix (Win/mac/Linux × Node 20/22/24) | ❌ no CI at all | ❌ ubuntu-only CI | ❌ n/a (it's the upstream binary) | n/a |
| **git and builds work inside Codex's Windows sandbox** (0.163: `elevated` → "dubious ownership", `unelevated` → no child processes; #24098 spawn bug fixed upstream) | ✅ `elevated` + `safe.directory` env for the workspace repo | ❌ | ⚠️ depends on user's backend | ⚠️ depends on user's backend | n/a |
| **Runaway/freeze guards** (timeout, anti-recursion, lock file, retry) | ✅ | ⚠️ inactivity timeout + retry only | ⚠️ background/cancel + broker-busy retry | ❌ (Codex defaults only) | n/a (cloud-managed) |
| **Live progress so long runs never look frozen** | ✅ MCP progress + tail-able log | ⚠️ terminal streaming/spinners | ✅ app-server progress events | ❌ | ❌ (async, no live feed) |
| **Structured verdict** | ✅ APPROVED/WARNING/BLOCKED (text) | ✅ JSON issues w/ severity+verdict | ✅ JSON schema, verdict + **confidence scores** | ❌ | ⚠️ P0/P1 inline comments |
| → *vs skill-codex* | — | **richer (typed JSON + audit)** | **richer (schema + confidence)** | — | — |
| **Bounded fix → re-review loop** | ✅ | ⚠️ multi-round debate (different shape) | ⚠️ Stop-hook review gate (ALLOW/BLOCK) | ❌ | ⚠️ `@codex fix it` (new cloud task) |
| **Bidirectional / multi-model consensus** | ❌ (Codex-from-Claude only) | ✅ **debate + convergence + audit** | ❌ (one direction) | ❌ | ❌ |
| **Adversarial / steerable review** | ⚠️ via prompt | ✅ devil's-advocate, debate | ✅ dedicated `/adversarial-review` | ❌ | ⚠️ scoped `@codex review for …` |
| **In-Claude-Code, no context switch** | ✅ | ❌ separate CLI | ✅ | ✅ | ❌ (GitHub) |
| **Low token / decision footprint for one-shot** | ⚠️ wrapper overhead | ❌ heaviest (multi-round × multi-model) | ⚠️ broker + commands | ✅ **lightest** | n/a |
| **Slash commands** | ✅ review/do/consult | ⚠️ its own CLI subcommands | ✅ rich set | ❌ | ❌ |
| **Auto-review hook (PostToolUse)** | ✅ w/ smart diff filtering | ❌ | ⚠️ optional Stop-gate (different trigger) | ❌ | ✅ auto-on-PR (cloud) |
| **Model + reasoning-effort per call** | ✅ | ✅ per-reviewer | ✅ `--model/--effort` | ✅ via `-c` flags | ❌ (cloud-chosen) |
| **Session memory across calls** | ✅ `codex exec resume` | ✅ per-provider sessions | ✅ `thread/resume`, `codex resume` | ⚠️ MCP-session dependent | n/a |
| **Background / async jobs** | ❌ | ❌ | ✅ status/result/cancel | ❌ | ✅ (cloud) |
| **Multi-AI-CLI support** (Claude/Codex/Gemini/Copilot) | ⚠️ positioned, Codex-focused | ✅ Claude/Codex/Gemini/Qwen + APIs | ❌ Codex only | ❌ Codex only | ❌ Codex only |
| **Official vendor support** | ❌ community | ❌ community | ✅ **OpenAI** | ✅ **OpenAI** | ✅ **OpenAI** |
| **Reviews local uncommitted changes pre-commit** | ✅ | ✅ (`--local`) | ✅ | ✅ | ❌ (PR only) |
| **Persistent decision log to repo** (prompt/diff/findings + per-finding accept-vs-dismiss + reason, committable) | ❌ *(not yet — proposed; see below)* | ⚠️ inline GitHub PR comments only | ❌ ephemeral JSON in session | ❌ ephemeral | ⚠️ GitHub PR review only |
| → *Is this unclaimed whitespace?* | **✅ yes — nobody persists Claude's accept/dismiss rationale to the repo** | — | — | — | — |

### Rows where skill-codex loses or ties (don't pretend otherwise)

- **Subscription auth** — tie, not a win. Everyone does it.
- **Structured output** — both codex-plugin-cc (JSON schema + confidence) and magpie (typed JSON + audit verdicts) are **richer** than our text-only APPROVED/WARNING/BLOCKED.
- **Bidirectional/consensus** — **magpie wins outright.** We don't do multi-model debate at all.
- **One-shot lightness** — the **official MCP wins.** We are heavier by design.
- **Official support, background jobs, adversarial review** — **codex-plugin-cc wins.**
- **Provider breadth** — **magpie wins** (4 CLIs + 4 API families); we're Codex-centric.

---

## "Why not just use the official Codex MCP / `codex exec` directly?"

**Concede first, because it's true:** for a one-shot "ask Codex to look at this," the official `codex mcp-server` is genuinely lighter — one official tool, no wrapper process, no slash commands, no hook, no lock file, fewer tokens, fewer decisions. If that's all you want, use it. We should say so.

**skill-codex earns its extra weight only when you want the *workflow*, not the *call*:**

1. **A review you act on, not just read.** The APPROVED/WARNING/BLOCKED verdict plus the **bounded fix → re-review loop** (Codex flags → Claude fixes → Codex re-checks *the same* issues via session memory, with a bound so it can't loop forever). The raw MCP gives you a blob of text and stops.
2. **Quota-aware automation.** The PostToolUse **auto-review hook** with smart diff filtering (skips docs-only/<5-line/whitespace; forces review on security paths and large/cross-cutting changes) reviews at the right moments without burning your Codex quota. The raw MCP reviews only when you remember to ask.
3. **Never frozen, never runaway.** Live MCP progress + tail-able log so long runs don't look hung; timeout → SIGTERM → SIGKILL, anti-recursion depth guard, and a stale-aware lock file. The raw MCP has Codex's own behavior and nothing else.
4. **Windows that actually runs.** Read-only by default (the example MCP registration pins `danger-full-access`), under the `elevated` sandbox skill-codex trusts the workspace repo so git works while builds and tests still run, and CI that *proves* it on Windows.
5. **Ergonomics + safety stance.** `/codex-review|do|consult`, the auto-trigger agent skill, and the explicit "Codex is a peer, not an authority — Claude stays the final judge" framing.

**Bottom line to put in front of users:** *"If you want to ask Codex one question, the official MCP is lighter — use it. skill-codex is for when you want Codex woven into your loop: a verdict you act on, automatic well-timed reviews that respect your quota, guards so nothing hangs or runs away, and Windows that's tested rather than hoped."* That is an honest, narrow, true pitch.

---

## Verdict on the subscription-auth claim

**It does NOT differentiate skill-codex.** Confirmed:

- The official **Codex MCP server** authenticates via the same `codex login` session (`~/.codex/auth.json`), which can be a ChatGPT/Codex **subscription** OAuth login, with **no `OPENAI_API_KEY`**. Source proof: `mcp-server` builds auth with `AuthManager::shared_from_config(config, /*enable_codex_api_key_env*/ false)` — same auth manager as the CLI, API-key-env path disabled.
- The official **codex-plugin-cc** uses local Codex CLI auth (ChatGPT incl. Free, or API key) and auto-detects which.
- **magpie's** CLI providers (codex-cli, claude-code, gemini-cli, qwen-code) are all subscription/OAuth, no API key.

So "no API key" is **table stakes** in this category, not an edge. **Recommendation:** demote it from a headline differentiator. It's still worth *stating* (it reassures newcomers who fear a metered API bill), but frame it as "like the official tooling, it uses your `codex login` — no API key," **not** as something competitors lack. The honest "How it compares" table in the README currently implies most bridges "often require an API key" (⚠️); against the *official* tooling that's false and should be softened, or scoped explicitly to "some third-party MCP bridges."

---

## Ideas worth adopting

**1. magpie's verify/audit step (adopt — highest ROI, lower cost than full debate).**
Even without multi-model debate, the single most valuable magpie idea is the **tool-equipped audit pass**: after Codex returns findings, have the reviewer (or Claude) re-check each finding against the actual code and assign `keep / rewrite / drop(reason) / new`, requiring a quoted-code `evidence` line for anything kept. This directly attacks false positives and is a natural extension of our existing fix→re-review loop. Lower token cost than debate, big precision win.

**2. magpie's bidirectional review → discuss → consensus (adopt cautiously, as opt-in).**
See the dedicated recommendation below. Net: adopt the *shape* as an optional "deep review" mode, not the default.

**3. Structured JSON output with confidence scores (adopt — already in our icebox).**
codex-plugin-cc's `review-output.schema.json` (verdict + findings with severity, file, line_start/line_end, **confidence 0–1**, recommendation) is a clean target. Our roadmap already lists `--output-schema`; ship it, and add a confidence field. Lets Claude rank/triage findings instead of treating all equally.

**4. Steerable adversarial review (adopt — small, high-value).**
codex-plugin-cc's `/adversarial-review` (typed attack surface + "break confidence in this change," takes user focus text) is a great `/codex-review --adversarial` or a `focus` param on the existing command. Cheap to add, distinct value.

**5. Background / async jobs (consider — bigger lift).**
codex-plugin-cc's status/result/cancel for long Codex runs is a real UX edge for big reviews. Lower priority for us, but note the gap.

**6. Convergence/early-stop judging (adopt the spirit).**
magpie's "strict consensus judge" that stops debate early is a good quota-saver. If we add any multi-pass mode, copy the idea: a cheap gate that ends the loop the moment there's nothing left to fix, rather than running a fixed number of rounds.

---

## Should we adopt magpie's bidirectional review → discuss → consensus?

**Recommendation: adopt the audit step now; adopt the debate/consensus loop later, as an opt-in "deep review" mode — not the default, and not on the critical path for v1.**

**Why adopt it at all.** It is the strongest competitor pattern in the space and the one commenters specifically admired. Two different model families debating, then a tool-verified judge, demonstrably reduces both false positives and blind-spot misses — which is *exactly* the "two models rarely make the same mistake" thesis skill-codex already sells. It would turn our tagline into a shipped feature rather than an analogy.

**Why not as the default.**
- **Cost/latency.** Multi-round × multi-model is the heaviest workflow in this whole comparison. It contradicts our "lighter than running it yourself" value for everyday review and would drain Codex/Claude quota fast.
- **Architecture fit.** skill-codex is a single-tool MCP bridge (`codex_exec`) where **Claude is the orchestrator and final judge**. magpie is a standalone orchestrator that *owns* the loop. Bolting a full debate engine inside an MCP tool fights our design. The cleaner fit is: Claude (already the orchestrator) runs the rounds, calling `codex_exec` as one debater and itself as the other, then runs the audit pass. That keeps our architecture intact and needs mostly prompt/skill work, not a new engine.
- **Scope discipline.** Our roadmap priorities are community/polish (v0.9) and API-surface freeze + Windows e2e (v1.0). A debate engine is a v1.1+ feature.

**Concrete plan.**
1. **Now (cheap, high ROI):** add the **tool-verified audit pass** to the existing review path (`keep/rewrite/drop/new` + required code evidence). Captures most of magpie's precision win at a fraction of the cost.
2. **Next:** add **structured JSON output + confidence** and an **adversarial/steerable** mode (both also borrowed from codex-plugin-cc).
3. **Later (opt-in `--deep` / `/codex-review --consensus`):** a bounded **2-model debate** — Claude and Codex each review independently, exchange findings for one challenge round, then Claude (as final judge) runs the audit and reconciles. Cap at 1–2 rounds with an early-stop convergence check. Keep it explicitly opt-in and quota-flagged.

This adopts magpie's best ideas without taking on its cost profile, its standalone-tool shape, or its Windows fragility — and it strengthens, rather than dilutes, the wedge below.

---

## The unclaimed wedge: a committable decision log (from launch feedback)

The single most useful launch comment (r/codex, u/Mysterious-Guide-745) reframed the value away from the saturated *"Codex reviews Claude"* toward **the audit trail around the handoff**: record, each time Claude delegates to or is reviewed by Codex, a small artifact — *prompt sent → diff reviewed → findings → which findings Claude accepted, which it dismissed, and why → fix/re-review resolution* — written into the repo as project history, not left in ephemeral chat context. *"The final code may pass tests, but a week later you want to know why Claude trusted one warning and dismissed another."*

**Why this is the strongest opportunity in this whole document:**

- **Nobody owns it.** Every competitor's review output is ephemeral (official MCP, `codex exec`, codex-plugin-cc's session JSON) or lives only in **GitHub PR comments** (magpie, `@codex review`) — post-push, and never capturing *Claude's accept/dismiss rationale*. A local, committable per-handoff decision log with reasons is genuinely unclaimed whitespace.
- **It reframes the category.** From "the 98th model-bridge" to **provenance for AI-assisted code** — a different, growing job (onboarding, code archaeology, compliance, PR descriptions) the lightweight tools structurally cannot do because they're stateless.
- **It rebuts the context-pollution critique simultaneously.** The artifact lives on disk, not in the model's context — so it *reduces* token/context load while *adding* auditability. That converts the answer to "why not the lighter MCP?" from "my heavier thing is worth it" into "I offer a capability the MCP cannot."
- **It composes with everything else here.** The fix→re-review loop already produces the findings; the audit pass (magpie) already produces keep/drop verdicts; this just *persists* them plus the human disposition. The eval harness can emit the same artifact format.

**Suggested shape:** `.codex-reviews/<commit-or-timestamp>.md` (markdown, linkable in PR descriptions) with structured frontmatter — task/prompt, base/commit SHAs, verdict, findings, per-finding `accepted|dismissed` + one-line reason, resolution. Make it the headline ROADMAP feature; lead the next post with it.

## Where skill-codex genuinely wins today (the defensible wedge)

These are the rows where we are actually ahead of the *relevant* alternatives, including the official ones:

1. **Windows that is verified, not hoped.** We run a 9-way CI matrix (Windows/macOS/Linux × Node 20/22/24) and, under the `elevated` sandbox, trust the workspace repo for git so Codex can run git, builds and tests (the original #24098 spawn bug is fixed upstream, so this part of the edge is narrower than it was). magpie has **no CI** and **bare-spawn ENOENT** on Windows; the **official** codex-plugin-cc has Windows code but **ubuntu-only CI** and **no sandbox backend pin**; the official MCP just inherits the Codex CLI and the user's backend. For a Windows-without-WSL developer, skill-codex is today the most reliable Codex-from-Claude path. **This is the single most defensible claim — lead with it.**
2. **The review *workflow*, not just the call.** Structured verdict + **bounded fix→re-review loop** + **quota-aware auto-review hook** + **never-frozen/never-runaway guards**, all inside Claude Code. The raw MCP is a passthrough; this is a loop you act on.
3. **Safe-by-default posture.** Read-only default (vs the MCP example's `danger-full-access`), explicit "Codex is a peer, Claude is the final judge."

## Where skill-codex is just one of many (be honest)

- **Subscription / no-API-key auth** — table stakes; not ours alone.
- **Being a Claude-Code↔Codex bridge** — the **official** codex-plugin-cc occupies this exact slot with OpenAI's name, background jobs, a richer schema, and adversarial review. We must beat it on **operational reliability (Windows, guards) and workflow ergonomics**, because we will not beat it on trust/longevity.
- **Sophistication of review** — magpie's debate+audit is more advanced than our single pass (until we adopt the audit step).
- **One-shot lightness** — the official MCP wins; don't fight that battle, concede it and redirect to the workflow.

**Strategic read:** the wedge is narrow but real — **tested-on-Windows + never-frozen + an act-on-it review loop, in-session.** Defend it by (a) leading with verified Windows support, (b) shipping the audit step and structured/confidence output to close the review-quality gap, and (c) being upfront that for a single one-shot question the official MCP is lighter. Stop leaning on subscription-auth as a differentiator — it isn't one.
