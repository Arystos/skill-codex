# Codex Code Review

Review the current changes using Codex as a second reviewer.

## Instructions

You are invoking Codex for a second-opinion code review. Follow these steps:

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

   **Option B (native Codex review):** Default to the Claude-assembled diff above, since the user prefers Claude-led review. You may instead call `codex_exec` with `review: true` to use `codex exec review`; add `reviewBase` for a branch or `reviewCommit` for a SHA. The prompt is optional focus instructions.

4. **Assign an overall verdict** from the findings (you are the final judge — weigh Codex's findings, don't just echo them):
   - **BLOCKED** — one or more CRITICAL/HIGH issues that should be fixed before merge
   - **WARNING** — only MEDIUM/LOW issues; safe to proceed with awareness
   - **APPROVED** — no substantive issues
   State it explicitly, e.g. `Verdict: BLOCKED — 2 CRITICAL, 1 MEDIUM`.

5. **Present findings** to the user:
   - Group by severity (CRITICAL first)
   - For each finding, add your own assessment: agree, disagree (with reasoning), or add nuance
   - Note anything Codex missed that you think is important
   - Summarize actionable items at the end

6. **If BLOCKED or WARNING, offer a bounded fix loop** (only with the user's go-ahead for automated fixing):
   - Fix the issues you agree are genuine. If you disagree with a finding, explain why instead of "fixing" it just to satisfy Codex.
   - Re-run the review (call `codex_exec` again on the updated diff) so Codex confirms the fixes and checks for regressions.
   - Repeat until the verdict is APPROVED or you have done **3 rounds**, then stop and summarize what remains. The hard cap keeps the loop from quietly burning your Codex quota.

## Important

- Codex runs in **read-only mode** — it cannot modify files
- Codex is a **peer, not an authority** — evaluate each finding critically and keep the final call yourself
- **Fail soft:** if `codex_exec` errors (Codex not installed, auth expired, offline), say so and fall back to your own review — a missing Codex should degrade to Claude-only review, never block the user
