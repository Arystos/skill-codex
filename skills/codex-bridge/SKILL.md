---
name: codex-bridge
description: Delegates bounded implementation work to OpenAI Codex via the codex_exec MCP tool, and uses Codex as an independent reviewer or second opinion. Use when the user asks to implement, write, generate, scaffold, port, refactor, migrate, or add tests for a well-scoped code task — especially phrases like "implement X", "write a function that", "generate tests for", "port this to", "refactor this file", "convert this", "add boilerplate", "create a script", "write a migration". Also use when the user asks for a second opinion, independent review, code review, or to double-check logic, security, or correctness of a diff. Do NOT use for architecture decisions, brainstorming, cross-module refactors needing deep context, or tasks under ~50 lines that are faster to do directly.
license: MIT
metadata:
  author: Arystos
  version: 0.8.0
  mcp-server: skill-codex
  category: developer-tools
---

# Codex Bridge

This skill turns OpenAI Codex into a peer engineer you can delegate bounded implementation work to, and a second reviewer you can call for independent code review or technical consultation. It uses the `codex_exec` MCP tool provided by the `skill-codex` MCP server.

## When to use this skill

Load this skill automatically when the user's request matches any of the following patterns:

**Delegation triggers** (use `delegate` workflow below):
- "implement X" / "write a function that X" / "create a script that X"
- "generate tests for X" / "add unit tests" / "scaffold tests"
- "port X to Y" / "convert X to Y" / "rewrite X in Y"
- "refactor this file" (single-file, clear target)
- "write a migration" / "create boilerplate for X"
- Any bounded, single-file or small multi-file code task with a clear spec

**Review triggers** (use `review` workflow below):
- "review my changes" / "review this diff" / "code review"
- "second opinion on this code" / "independent review"
- "check this for bugs" / "audit this for security issues"
- Before committing critical code (auth, payments, crypto, concurrency)

**Consult triggers** (use `consult` workflow below):
- "what do you think about this approach"
- "is this the right way to do X"
- "second opinion on my plan"
- Debugging when Claude has failed 3+ times on the same issue

## When NOT to use this skill

Skip Codex and do the work yourself when:
- Task is <50 lines and faster to do directly
- Task requires deep conversation context Codex won't have
- Cross-module architectural refactor
- Ambiguous requirements needing user clarification
- Planning, brainstorming, or design decisions (Claude handles these)
- User explicitly asks you to do the work yourself

## Workflows

### Workflow 1: Delegate implementation (`delegate`)

Use when the user asks for a bounded implementation task with a clear spec.

**Steps:**

1. **Verify the task is well-scoped and the project uses git.** If the request is vague, ask one clarifying question before delegating. Delegation needs git to detect every changed file; in a project without git (e.g. Diversion), do the task yourself instead.

2. **Fix the scope.** Every delegation needs an **allowed file list** (the exact paths Codex may create, modify or delete) and a **verification command** that defines "done" and prints pass/fail (tests or a build). Derive both from the task; if you can't name either with confidence, ask the user.

3. **Announce the delegation.** Tell the user: `Delegating [task] to Codex.`, with the allowed files and the verification command. Never invoke Codex silently.

4. **Prepare a self-contained prompt.** Include:
   - The specific change, with before/after examples if helpful
   - "You may modify ONLY these files: <allowed files>. Do not create, edit or delete any other file; if another file seems necessary, stop and say which one and why."
   - "Done means this command passes: `<verification command>`."
   - Coding style constraints (e.g., "TypeScript strict, no `any`, immutable patterns")

5. **Call the `codex_exec` MCP tool** with:
   ```
   prompt: <the self-contained prompt>
   mode: "full-auto"
   requireGit: true
   ```

6. **Check for drift.** Run `git status --short` (catches new files that `git diff` misses) and compare every changed path with the allowed list. Report anything outside it as drift, and offer to revert it — never accept it silently.

7. **Review the in-scope changes** with `git diff` and by reading new files: correctness, security, regressions. Skip style nits.

8. **Run the verification command yourself** and show the output. The task is done only if it passes and no unapproved drift remains. Codex is a **peer, not an authority** — you own the final quality.

### Workflow 2: Independent code review (`review`)

Use when the user wants a second-opinion review of a diff, branch, or commit.

**Steps:**

1. **Determine the scope of the review.** Check `git rev-parse --is-inside-work-tree` first.
   - No argument → run `git status --short` first to catch new untracked files (`??`), then collect `git diff` (unstaged) + `git diff --cached` (staged), and include the contents of any new untracked files — plain `git diff` is blind to them
   - Branch name → `git diff <branch>...HEAD`
   - SHA → `git show <sha>`
   - **No git** (git missing, or another VCS such as Diversion) → review an explicit list of files instead (ask for it if none was given), send their full contents with `requireGit: false`, and say that without a diff the out-of-scope check is skipped.
   - If there are no changes at all, tell the user and stop.
   - Optional **spec** (`--spec <path>` on `/codex-review`): include its contents and ask Codex to check that every requirement is implemented, every listed edge case has a test, and nothing outside the spec's scope changed.

2. **Check diff size.** If the diff exceeds ~50,000 characters, summarize it first and warn the user that Codex will see a truncated version.

3. **Call the `codex_exec` MCP tool** in read-only mode:
   ```
   prompt: "Review the following code changes. Report only: (1) correctness bugs, (2) security issues, (3) gaps against the stated requirements. Do NOT report style, naming, formatting or readability. Do NOT suggest defensive checks for states the code cannot reach. An empty review is a valid result. For each finding, give: severity (CRITICAL/HIGH/MEDIUM/LOW), category, file and line, description, and suggested fix.\n\nStated requirements: <the task, or 'none given'>\n\n```diff\n<diff>\n```"
   mode: "exec"
   requireGit: true   # false for a file review without git
   ```

   A reviewer asked to find gaps always finds some, and chasing all of them leads to over-engineering. Keep the focus on failures, vulnerabilities and missed requirements — in Codex's prompt and in your own audit.

4. **Audit each finding against the actual code** before trusting it. For each finding Codex returned, open the cited file/line and classify it: **keep** (confirmed — quote the offending code as evidence), **rewrite** (real, but Codex got the severity/location/explanation wrong — restate with evidence), **drop** (not real — give a typed reason: `codebase-convention`, `pre-existing`, `cannot-occur` — including defensive checks for unreachable states, `out-of-scope` — including style and readability, or `false-claim`), or **new** (a real issue Codex missed, found while auditing — add with evidence). `keep`/`rewrite`/`new` must cite concrete code; only they carry forward.

5. **Assign an overall verdict from the audited findings** (you are the final judge, not a relay): **BLOCKED** (≥1 surviving CRITICAL/HIGH), **WARNING** (only surviving MEDIUM/LOW), or **APPROVED** (nothing survived). State it explicitly, e.g. `Verdict: BLOCKED — 1 CRITICAL (2 of Codex's findings dropped)`.

6. **Present findings grouped by severity** — surviving findings with your code evidence and `keep`/`rewrite`/`new` label, plus a short **"Filtered"** list of the dropped findings with their reason (transparency, not silent suppression). End with a summary of actionable items.

7. **If BLOCKED or WARNING, offer a bounded fix loop** (with the user's go-ahead): fix the surviving issues, re-run `codex_exec` on the updated diff to confirm the fixes and catch regressions (audit the new findings too), and repeat until APPROVED or **3 rounds max** — then stop and summarize what's left. The cap prevents runaway Codex quota use.

### Workflow 3: Consult for a second opinion (`consult`)

Use when you want Codex's perspective on a plan, hypothesis, or technical decision — no files modified.

**Steps:**

1. **Frame the question precisely.** Include:
   - The specific question or plan to evaluate
   - Relevant context: file paths, code snippets, constraints
   - What kind of feedback you want (validation, alternatives, risks)

2. **Call `codex_exec`** in read-only mode:
   ```
   prompt: "Provide your analysis and recommendation on the following question. Consider tradeoffs, alternatives, and risks. Be specific.\n\n<question with context>"
   mode: "exec"
   ```

3. **Synthesize both perspectives.** Present Codex's analysis, then your own independent analysis. State where you agree/disagree with evidence. Give a recommended path forward with reasoning.

## The `codex_exec` tool

The skill-codex MCP server exposes exactly one tool: `codex_exec`.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | yes | The prompt to send to Codex |
| `mode` | `"exec"` \| `"full-auto"` | no (default `"exec"`) | `exec` is read-only; `full-auto` allows file writes |
| `sandbox` | `"read-only"` \| `"workspace-write"` \| `"danger-full-access"` | no | Explicit sandbox policy; overrides `mode`. Use `danger-full-access` only when you understand the risk |
| `sessionId` | string | no | Resume a prior Codex session (the thread id from a previous response) so Codex keeps context across calls |
| `model` | string | no | Codex model. The tool's `model` description lists the models on this account; pick one to fit the task, or omit for the user's default |
| `reasoningEffort` | `"minimal"` \| `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` | no | How much reasoning effort Codex spends. Omit for the model's default |
| `review` | boolean | no | Run Codex's native diff-scoped review (`codex exec review`) instead of a freeform prompt |
| `reviewBase` | string | no | With `review`: diff against this base branch |
| `reviewCommit` | string | no | With `review`: review the changes introduced by this commit SHA |
| `cwd` | string | no | Working directory for Codex |
| `timeoutMs` | number | no | Override default 5min timeout |
| `requireGit` | boolean | no | Refuse to run if cwd is not a git repo (recommended `true` for `full-auto`) |

**Command flags:** the `/codex-review`, `/codex-do`, and `/codex-consult` commands accept optional `--effort <level>` (`minimal`|`low`|`medium`|`high`|`xhigh`) and `--model <name>` flags in their arguments. Parse and strip them, then pass through as `reasoningEffort` / `model`; an explicit flag always wins. Without `--effort`, omit `reasoningEffort`.

**Model routing:** without `--model`, choose the model yourself from the list in the `codex_exec` tool's `model` parameter. Use the strongest listed model for reviews, security-sensitive and multi-file work, and a fast one for quick questions, summaries and small edits. Use only listed slugs. If no list is shown or you are unsure, omit `model` for the user's default. A model Codex rejects falls back to the default automatically, and the response header shows the model that ran.

**Modes:**
- `exec` → read-only. Use for review and consult.
- `full-auto` → can modify files. Use only for delegate, and always with `requireGit: true`.

## Examples

### Example 1: Delegate — generate tests

**User says:** "Write unit tests for `src/util/platform.ts`. Use vitest. Cover the `getClaudeDir` and `getHomeDir` functions including Windows/macOS/Linux branches."

**Actions:**
1. Announce: `Delegating test generation to Codex. Allowed files: __tests__/util/platform.test.ts. Verification: npx vitest run __tests__/util/platform.test.ts`
2. Call `codex_exec` with `mode: "full-auto"`, `requireGit: true`, and a prompt specifying: the target file, test framework (vitest), the allowed file list (only `__tests__/util/platform.test.ts`), the two functions to cover, the three OS branches, the verification command, and the project convention (TS strict, no `any`).
3. `git status --short` → the only change is the new test file, so there is no drift. Read it: imports are correct.
4. Run `npx vitest run __tests__/util/platform.test.ts` yourself and show the output.
5. Report: `Codex generated 6 tests covering all three OS branches. Verification passed (output above). Drift: none.`

### Example 2: Review — pre-commit diff

**User says:** "Review my changes before I commit."

**Actions:**
1. Run `git status --short` (to catch new untracked files), then `git diff` → capture unstaged changes (fall back to `git diff --cached` if empty).
2. Call `codex_exec` with `mode: "exec"` and the review prompt.
3. **Audit** Codex's 4 findings against the code: `keep` 1 CRITICAL (missing null check, `src/runner/runner.ts:47` — quoted the unguarded deref as evidence); `rewrite` 1 MEDIUM → it's really HIGH and at line 52; `drop` 1 MEDIUM (`codebase-convention` — matches the repo's existing error pattern) and 1 LOW (`out-of-scope` — style nit); add 1 `new` MEDIUM Codex missed (the same null pattern repeats at `:71`).
4. Present: `Verdict: BLOCKED — 1 CRITICAL, 1 HIGH, 1 MEDIUM (audited; 2 of Codex's findings filtered)`, with the "Filtered" list and its reasons. Offer to fix the surviving issues.

### Example 3: Consult — architecture question

**User says:** "Should I use a lock file or a mutex for the codex subprocess?"

**Actions:**
1. Frame the question with context: existing `src/lock/` module, single-machine usage, Windows compatibility requirement.
2. Call `codex_exec` with `mode: "exec"`.
3. Synthesize: Codex recommends lock file for cross-process safety; your analysis confirms it's the right choice given Windows named-mutex quirks; recommend proceeding with lock file approach.

## Troubleshooting

**Error: `codex` binary not found**
- Cause: Codex CLI not installed or not on PATH.
- Solution: Tell the user to install it (`npm i -g @openai/codex` or equivalent) and re-run.

**Error: Authentication required**
- Cause: User hasn't run `codex login`.
- Solution: Tell the user to run `codex login` (uses ChatGPT Plus/Codex subscription) or set `OPENAI_API_KEY`.

**Error: Lock file conflict**
- Cause: Another Codex subprocess is already running in the same workspace.
- Solution: Wait for it to finish, or check for stale lock (PID dead, >15 min old) and retry.

**Error: Recursion limit reached**
- Cause: Codex is running inside Codex (nested `codex_exec` calls).
- Solution: Do not delegate from within a Codex-initiated session. Claude should handle the task directly.

**Error: Timeout (5 min default)**
- Cause: Task is too large or Codex is stuck.
- Solution: Break the task into smaller delegations, or override `timeoutMs` for genuinely long-running work.

**Codex returns but made wrong changes**
- Do not accept blindly. Run `git diff`, evaluate, then either fix the issue yourself or re-delegate with a refined prompt that addresses the specific mistake.

## Critical rules

- **Never invoke Codex silently.** Always tell the user what you are delegating and why.
- **After `full-auto` runs, check `git status --short` then `git diff`.** `git status` catches new files `git diff` misses; verify scope and correctness before presenting results.
- **Fail soft.** If `codex_exec` errors (Codex missing, auth expired, offline), say so and continue with Claude-only work — never block the user on a missing Codex.
- **Codex is a peer, not an authority.** Every output must pass your review.
- **Do not delegate trivial tasks** (<50 lines or <2 minutes of direct work). Overhead exceeds benefit.
- **Pair `full-auto` with `requireGit: true`** so Codex refuses to touch non-git directories, and always give it an allowed file list and a verification command.
