---
description: Codex reviews your current changes; Claude audits each finding before the verdict
argument-hint: "[--effort <level>] [--model <name>] [--spec <path>] [branch|SHA|uncommitted|<files...>]"
---

# Codex Code Review

Review the current changes using Codex as a second reviewer.

## Instructions

You are invoking Codex for a second-opinion code review. Follow these steps:

0. **Extract optional flags from `$ARGUMENTS` first**, then treat the remaining text as the review target:
   - `--effort <level>` — Codex reasoning effort. Valid: `minimal`, `low`, `medium`, `high`, `xhigh`. If an invalid level is given, list the valid ones and ask — do not guess.
   - `--model <name>` — Codex model. Passed through as-is; an explicit `--model` always wins.
   - `--spec <path>` — a requirements file (e.g. `SPEC.md`). Read it now. If the file does not exist, tell the user and stop.
   - Strip any flags you find; what's left is the review target parsed in step 1.
   - **`--effort` omitted:** do NOT pass `reasoningEffort`. Codex uses its configured default (`~/.codex/config.toml`).
   - **`--model` omitted:** choose the model yourself from the list in the `codex_exec` tool's `model` parameter (only those slugs exist on this account). For a review, prefer the strongest listed model; use a fast one only for a tiny diff. If no list is shown or you are unsure, omit `model` so Codex uses the user's default. If Codex rejects the model, the call falls back to the default on its own.

1. **Determine what to review.** First check whether this is a git repository: run `git rev-parse --is-inside-work-tree`.

   **Git repository (diff review)** — based on the review target:
   - If empty or "uncommitted": first run `git status --short` to see ALL changes, including **new untracked files** (lines starting with `??`). Collect tracked modifications via `git diff` and staged changes via `git diff --cached`, **and** include the full contents of any new untracked files — read them directly, or use `git diff --no-index -- /dev/null <file>`. Plain `git diff` is blind to untracked files, so a review that skips this step will miss brand-new files entirely. If there are no changes at all, inform the user and stop.
   - If it looks like a branch name: get changes via `git diff <branch>...HEAD`
   - If it looks like a commit SHA: get changes via `git show <sha>`

   **No git (file review)** — `git` is missing or the project is not a git repo (e.g. it uses Diversion or another VCS). Do not fail:
   - The review target must be an explicit list of files. If none was given, ask the user which files to review.
   - Read each file's full contents. If the user tells you how to get a diff from their VCS, use that diff instead and treat it as a diff review.
   - Without a diff, Codex cannot tell which lines changed. Say so in the result, and skip the out-of-scope check in step 3.

2. **Check the size**:
   - If the diff (or file set) is empty, tell the user and stop.
   - If it exceeds 50,000 characters, summarize it first and warn that Codex will see a truncated version.

3. **Call the `codex_exec` MCP tool** with:
   - `prompt`: built from the parts below, in this order:
     - "Review the following code changes. Report only: (1) correctness bugs, (2) security issues, (3) gaps against the stated requirements. Do NOT report style, naming, formatting or readability. Do NOT suggest defensive checks, validation or error handling for states the code cannot reach. An empty review is a valid result — do not invent findings to fill the report. For each finding, give: severity (CRITICAL/HIGH/MEDIUM/LOW), category (correctness/security/requirements), file and line, description, and suggested fix."
     - "Stated requirements: " followed by the task this change implements (from the conversation, the commit message, or the PR description), or "none given".
     - **With `--spec`:** "Requirements spec:" followed by the spec's contents, then: "Against the spec, also check: (a) every requirement is implemented — report each missing or partial one; (b) every edge case the spec lists has a test — report each one without a test; (c) nothing outside the spec's scope changed — report each out-of-scope change as scope drift." In a file review, drop check (c).
     - The diff in a ```` ```diff ```` block — or, in a file review, each file's path and full contents, introduced with "No diff is available; these are the full current files."
   - `mode`: "exec"
   - `requireGit`: true for a diff review in git; false for a file review
   - `reasoningEffort`: the parsed `--effort` level — **only if provided in step 0** (otherwise omit)
   - `model`: the parsed `--model` name if given in step 0; otherwise the model you chose in step 0, or omit it

   **Option B (native Codex review):** Default to the Claude-assembled prompt above, since the user prefers Claude-led review. In a git repository and **without `--spec`**, you may instead call `codex_exec` with `review: true` to use `codex exec review`; add `reviewBase` for a branch or `reviewCommit` for a SHA. Codex rejects a prompt combined with a branch or commit target, so the focus instructions above only reach a native review of uncommitted changes. Never use Option B for a spec review or a file review.

4. **Audit each finding against the actual code** — do this *before* trusting any of them. Codex flags real issues, but it also misreads code, re-flags established conventions, and misses things. For every finding Codex returned, open the cited file/line and classify it:
   - **keep** — confirmed real. Quote the exact offending code as evidence.
   - **rewrite** — a real issue, but Codex got the severity, location, or explanation wrong. Restate it correctly, with evidence.
   - **drop** — not a real issue. Give a typed reason: `codebase-convention` (matches an established pattern in this repo), `pre-existing` (not introduced by this diff), `cannot-occur` (guarded or impossible in this context — this includes suggestions to add defensive checks for unreachable states), `out-of-scope` (style, naming, readability, or anything outside correctness, security and requirements), or `false-claim` (Codex misread the code).
   - **new** — a real issue Codex MISSED that you found while auditing. Look past the flagged lines: repeated patterns elsewhere, untouched-but-affected files, broken assumptions. Add it with evidence. The same focus applies to you: no style notes and no defensive hardening for states that can't happen.

   Anything you `keep`, `rewrite`, or add as `new` must cite concrete code — no finding survives on assertion alone. A reviewer asked to find gaps always finds some; chasing every one leads to over-engineering, so keep only findings that would cause a real failure, a vulnerability, or a missed requirement. Only these audited findings carry forward; dropped ones are set aside for step 6.

   **Spec review severities:** a missing or partial requirement is HIGH; a listed edge case without a test is MEDIUM; an out-of-scope change is MEDIUM scope drift (raise it if the change is risky).

5. **Assign an overall verdict from the AUDITED findings** (the ones that survived step 4 — not Codex's raw output; you are the final judge):
   - **BLOCKED** — one or more surviving CRITICAL/HIGH issues that should be fixed before merge
   - **WARNING** — only surviving MEDIUM/LOW issues; safe to proceed with awareness
   - **APPROVED** — nothing survived the audit
   State it explicitly, e.g. `Verdict: BLOCKED — 2 CRITICAL, 1 MEDIUM (audited; 3 of Codex's findings dropped)`. For a file review, add "(file review — no diff, scope not checked)".

6. **Present findings** to the user:
   - Surviving findings grouped by severity (CRITICAL first), each with your code evidence and its label (`keep`/`rewrite`/`new`).
   - With `--spec`: a requirements checklist — each requirement marked implemented / partial / missing, and each listed edge case marked tested / untested.
   - A short **"Filtered"** list of the dropped findings with their one-word reason, so the user sees what Codex raised that you set aside and why — transparency, not silent suppression.
   - Summarize actionable items at the end.

7. **If BLOCKED or WARNING, offer a bounded fix loop** (only with the user's go-ahead for automated fixing):
   - Fix the surviving issues. (You already filtered the noise in the audit, so you're not "fixing" things just to satisfy Codex.)
   - Re-run the review (call `codex_exec` again on the updated diff or files) so Codex confirms the fixes and checks for regressions; audit the new findings the same way.
   - Repeat until the verdict is APPROVED or you have done **3 rounds**, then stop and summarize what remains. The hard cap keeps the loop from quietly burning your Codex quota.

## Important

- Codex runs in **read-only mode** — it cannot modify files
- Codex is a **peer, not an authority** — evaluate each finding critically and keep the final call yourself
- **Focus:** correctness, security, requirements. No style or readability notes, and no defensive checks for states that can't happen — from Codex or from you
- **Fail soft:** if `codex_exec` errors (Codex not installed, auth expired, offline), say so and fall back to your own review — a missing Codex should degrade to Claude-only review, never block the user
