# Codex Code Review

Review the current changes using Codex as a second reviewer.

## Instructions

You are invoking Codex for a second-opinion code review. Follow these steps:

1. **Determine what to review** based on `$ARGUMENTS`:
   - If empty or "uncommitted": get unstaged changes via `git diff`. If empty, try staged changes via `git diff --cached`. If both empty, inform the user there are no changes to review.
   - If it looks like a branch name: get changes via `git diff <branch>...HEAD`
   - If it looks like a commit SHA: get changes via `git show <sha>`

2. **Check the diff size**:
   - If the diff is empty, tell the user and stop.
   - If the diff exceeds 50,000 characters, summarize it first and warn that Codex will see a truncated version.

3. **Call the `codex_exec` MCP tool** with:
   - `prompt`: "Review the following code changes. For each finding, specify: severity (CRITICAL/HIGH/MEDIUM/LOW), file and line, description, and suggested fix.\n\nFocus on: bugs, security issues, performance problems, error handling gaps, and readability.\n\n```diff\n<the diff>\n```"
   - `mode`: "exec"
   - `requireGit`: true

4. **Present findings** to the user:
   - Group by severity (CRITICAL first)
   - For each finding, add your own assessment: agree, disagree, or nuance
   - Note anything Codex missed that you think is important
   - Summarize actionable items at the end

5. **If Codex found issues**, offer to fix them.

## Important

- Codex runs in **read-only mode** — it cannot modify files
- Codex is a **peer, not an authority** — evaluate each finding critically
- If the MCP tool returns an error, explain what happened and suggest remediation
