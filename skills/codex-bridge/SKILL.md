---
name: codex-bridge
description: Delegates bounded implementation work to OpenAI Codex via the codex_exec MCP tool, and uses Codex as an independent reviewer or second opinion. Use when the user asks to implement, write, generate, scaffold, port, refactor, migrate, or add tests for a well-scoped code task — especially phrases like "implement X", "write a function that", "generate tests for", "port this to", "refactor this file", "convert this", "add boilerplate", "create a script", "write a migration". Also use when the user asks for a second opinion, independent review, code review, or to double-check logic, security, or correctness of a diff. Do NOT use for architecture decisions, brainstorming, cross-module refactors needing deep context, or tasks under ~50 lines that are faster to do directly.
license: MIT
metadata:
  author: Arystos
  version: 0.6.0
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

1. **Verify the task is well-scoped.** If the request is vague, ask one clarifying question before delegating. A good delegation prompt has: exact file paths, specific change required, constraints (language, style, naming), and a clear "done" condition.

2. **Announce the delegation.** Tell the user: `Delegating [task] to Codex.` Never invoke Codex silently.

3. **Prepare a self-contained prompt.** Include:
   - Exact file paths to create or modify (absolute or repo-relative)
   - The specific change, with before/after examples if helpful
   - Coding style constraints (e.g., "TypeScript strict, no `any`, immutable patterns")
   - What success looks like (e.g., "tests pass, no new lint errors")

4. **Call the `codex_exec` MCP tool** with:
   ```
   prompt: <the self-contained prompt>
   mode: "full-auto"
   requireGit: true
   ```

5. **Review Codex's output critically.** Run `git status --short` (catches new files that `git diff` misses), then `git diff`, to see exactly what changed. Check for:
   - Introduced bugs, logic errors, or regressions
   - Style violations against the project's conventions
   - Files modified outside the requested scope
   - Missing test coverage if tests were part of the task

6. **Present the result with your assessment.** State what Codex did correctly, what needs adjustment, and either accept the changes or fix/re-delegate. Codex is a **peer, not an authority** — you own the final quality.

### Workflow 2: Independent code review (`review`)

Use when the user wants a second-opinion review of a diff, branch, or commit.

**Steps:**

1. **Determine the scope of the review:**
   - No argument → run `git status --short` first to catch new untracked files (`??`), then collect `git diff` (unstaged) + `git diff --cached` (staged), and include the contents of any new untracked files — plain `git diff` is blind to them
   - Branch name → `git diff <branch>...HEAD`
   - SHA → `git show <sha>`
   - If there are no changes at all, tell the user and stop.

2. **Check diff size.** If the diff exceeds ~50,000 characters, summarize it first and warn the user that Codex will see a truncated version.

3. **Call the `codex_exec` MCP tool** in read-only mode:
   ```
   prompt: "Review the following code changes. For each finding, specify: severity (CRITICAL/HIGH/MEDIUM/LOW), file and line, description, and suggested fix. Focus on: bugs, security, performance, error handling, readability.\n\n```diff\n<diff>\n```"
   mode: "exec"
   requireGit: true
   ```

4. **Assign an overall verdict** (you are the final judge, not a relay): **BLOCKED** (≥1 CRITICAL/HIGH), **WARNING** (only MEDIUM/LOW), or **APPROVED** (none). State it explicitly, e.g. `Verdict: BLOCKED — 1 CRITICAL`.

5. **Present findings grouped by severity.** For each finding, add your own assessment: agree, disagree with reasoning, or add nuance. Note anything Codex missed that you think is important. End with a summary of actionable items.

6. **If BLOCKED or WARNING, offer a bounded fix loop** (with the user's go-ahead): fix the issues you agree are real, re-run `codex_exec` on the updated diff to confirm the fixes and catch regressions, and repeat until APPROVED or **3 rounds max** — then stop and summarize what's left. The cap prevents runaway Codex quota use.

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
| `cwd` | string | no | Working directory for Codex |
| `timeoutMs` | number | no | Override default 5min timeout |
| `requireGit` | boolean | no | Refuse to run if cwd is not a git repo (recommended `true` for `full-auto`) |

**Modes:**
- `exec` → read-only. Use for review and consult.
- `full-auto` → can modify files. Use only for delegate, and always with `requireGit: true`.

## Examples

### Example 1: Delegate — generate tests

**User says:** "Write unit tests for `src/util/platform.ts`. Use vitest. Cover the `getClaudeDir` and `getHomeDir` functions including Windows/macOS/Linux branches."

**Actions:**
1. Announce: `Delegating test generation to Codex.`
2. Call `codex_exec` with `mode: "full-auto"`, `requireGit: true`, and a prompt specifying: the target file, test framework (vitest), test file path (`__tests__/util/platform.test.ts`), the two functions to cover, the three OS branches, and the project convention (TS strict, no `any`).
3. `git diff` → verify only the new test file was created, imports are correct, no existing files touched.
4. Report: `Codex generated 6 tests covering all three OS branches. All pass locally. No files outside scope modified.`

### Example 2: Review — pre-commit diff

**User says:** "Review my changes before I commit."

**Actions:**
1. Run `git status --short` (to catch new untracked files), then `git diff` → capture unstaged changes (fall back to `git diff --cached` if empty).
2. Call `codex_exec` with `mode: "exec"` and the review prompt.
3. Present: 1 CRITICAL (missing null check, `src/runner/runner.ts:47` — confirmed), 2 MEDIUM (disagree with one, agree with the other), 1 LOW (style nit, skip).
4. Offer to fix the CRITICAL and the confirmed MEDIUM.

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
- **Pair `full-auto` with `requireGit: true`** so Codex refuses to touch non-git directories.
