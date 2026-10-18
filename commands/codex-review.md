---
description: Codex reviews your current changes; Claude audits each finding before the verdict
argument-hint: "[--effort <level>] [--model <name>] [branch|SHA|uncommitted]"
---

# Codex Code Review

Review the current changes using Codex as a second reviewer.

## Instructions

You are invoking Codex for a second-opinion code review. Follow these steps:

0. **Extract optional flags from `$ARGUMENTS` first**, then treat the remaining text as the review target:
   - `--effort <level>` — Codex reasoning effort. Valid: `minimal`, `low`, `medium`, `high`, `xhigh`. If an invalid level is given, list the valid ones and ask — do not guess.
   - `--model <name>` — Codex model (e.g. `gpt-6.1-sol`, `gpt-6-luna`). Passed through as-is. Availability depends on your ChatGPT plan and Codex version (`codex debug models` lists yours); omit to use the configured default.
   - Strip any flags you find; what's left is the review target parsed in step 1.
   - **Omitted → default:** if a flag is absent, do NOT pass that parameter to `codex_exec`. Codex falls back to its configured default (`~/.codex/config.toml`). Never invent a value.

1. **Determine what to review** based on `$ARGUMENTS`:
   - If empty or "uncommitted": first run `git status --short` to see ALL changes, including **new untracked files** (lines starting with `??`). Collect tracked modifications via `git diff` and staged changes via `git diff --cached`, **and** include the full contents of any new untracked files — read them directly, or use `git diff --no-index -- /dev/null <file>`. Plain `git diff` is blind to untracked files, so a review that skips this step will miss brand-new files entirely. If there are no changes at all, inform the user and stop.
   - If it looks like a branch name: get changes via `git diff <branch>...HEAD`
   - If it looks like a commit SHA: get changes via `git show <sha>`

2. **Check the diff size**:
   - If the diff is empty, tell the user and stop.
   - If the diff exceeds 50,000 characters, summarize it first and warn that Codex will see a truncated version.

3. **Call the `codex_exec` MCP tool** with:
   - `prompt`: "Review the following code changes. For each finding, specify: severity (CRITICAL/HIGH/MEDIUM/LOW), file and line, description, and suggested fix.\n\nFocus on: bugs, security issues, performance problems, error handling gaps, and readability.\n\n```diff\n<the diff>\n```"
   - `mode`: "exec"
   - `requireGit`: true
   - `reasoningEffort`: the parsed `--effort` level — **only if provided in step 0** (otherwise omit)
   - `model`: the parsed `--model` name — **only if provided in step 0** (otherwise omit)

   **Option B (native Codex review):** Default to the Claude-assembled diff above, since the user prefers Claude-led review. You may instead call `codex_exec` with `review: true` to use `codex exec review`; add `reviewBase` for a branch or `reviewCommit` for a SHA. The prompt is optional focus instructions.

4. **Audit each finding against the actual code** — do this *before* trusting any of them. Codex flags real issues, but it also misreads code, re-flags established conventions, and misses things. For every finding Codex returned, open the cited file/line and classify it:
   - **keep** — confirmed real. Quote the exact offending code as evidence.
   - **rewrite** — a real issue, but Codex got the severity, location, or explanation wrong. Restate it correctly, with evidence.
   - **drop** — not a real issue. Give a typed reason: `codebase-convention` (matches an established pattern in this repo), `pre-existing` (not introduced by this diff), `cannot-occur` (guarded or impossible in this context), `out-of-scope` (style nit outside the review's focus), or `false-claim` (Codex misread the code).
   - **new** — a real issue Codex MISSED that you found while auditing. Look past the flagged lines: repeated patterns elsewhere, untouched-but-affected files, broken assumptions. Add it with evidence.

   Anything you `keep`, `rewrite`, or add as `new` must cite concrete code — no finding survives on assertion alone. Only these audited findings carry forward; dropped ones are set aside for step 6.

5. **Assign an overall verdict from the AUDITED findings** (the ones that survived step 4 — not Codex's raw output; you are the final judge):
   - **BLOCKED** — one or more surviving CRITICAL/HIGH issues that should be fixed before merge
   - **WARNING** — only surviving MEDIUM/LOW issues; safe to proceed with awareness
   - **APPROVED** — nothing survived the audit
   State it explicitly, e.g. `Verdict: BLOCKED — 2 CRITICAL, 1 MEDIUM (audited; 3 of Codex's findings dropped)`.

6. **Present findings** to the user:
   - Surviving findings grouped by severity (CRITICAL first), each with your code evidence and its label (`keep`/`rewrite`/`new`).
   - A short **"Filtered"** list of the dropped findings with their one-word reason, so the user sees what Codex raised that you set aside and why — transparency, not silent suppression.
   - Summarize actionable items at the end.

7. **If BLOCKED or WARNING, offer a bounded fix loop** (only with the user's go-ahead for automated fixing):
   - Fix the surviving issues. (You already filtered the noise in the audit, so you're not "fixing" things just to satisfy Codex.)
   - Re-run the review (call `codex_exec` again on the updated diff) so Codex confirms the fixes and checks for regressions; audit the new findings the same way.
   - Repeat until the verdict is APPROVED or you have done **3 rounds**, then stop and summarize what remains. The hard cap keeps the loop from quietly burning your Codex quota.

## Important

- Codex runs in **read-only mode** — it cannot modify files
- Codex is a **peer, not an authority** — evaluate each finding critically and keep the final call yourself
- **Fail soft:** if `codex_exec` errors (Codex not installed, auth expired, offline), say so and fall back to your own review — a missing Codex should degrade to Claude-only review, never block the user
