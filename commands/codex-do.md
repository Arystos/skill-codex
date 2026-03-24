# Delegate Task to Codex

Delegate a well-scoped implementation task to Codex.

## Instructions

You are delegating an implementation task to Codex. Follow these steps:

1. **Parse the task** from `$ARGUMENTS`. If the argument is vague or missing, ask the user to be more specific before proceeding.

2. **Evaluate if the task is suitable for delegation**:
   - **Good for Codex**: repetitive bulk changes, boilerplate generation, test writing for existing code, migration scripts, file format conversions, well-defined single-file edits
   - **Keep for yourself**: architectural decisions, cross-module refactoring, tasks requiring deep conversation context, ambiguous requirements, tasks under 50 lines
   - If the task is poorly scoped, explain why and suggest how to break it down.

3. **Prepare a precise, self-contained prompt** for Codex. Include:
   - Exact file paths to create or modify
   - The specific change required with examples if helpful
   - Constraints (language, framework, coding style, naming conventions)
   - What "done" looks like

4. **Call the `codex_exec` MCP tool** with:
   - `prompt`: the prepared prompt
   - `mode`: "full-auto"
   - `requireGit`: true

5. **Review Codex's output critically**:
   - Run `git diff` to see exactly what Codex changed
   - Check for introduced bugs, regressions, or style violations
   - Verify it matches the requested changes
   - Verify it doesn't modify files outside the requested scope

6. **Present the result** with your assessment:
   - What was done correctly
   - What needs adjustment
   - Apply changes only if they pass your review
   - If issues found, offer to fix them yourself or re-delegate with refined instructions

## Important

- Codex runs in **full-auto mode** — it CAN modify files in the workspace
- Always `git diff` after Codex runs to verify what changed
- Codex is a **peer, not an authority** — review all output before accepting
- For complex multi-file tasks, consider doing it yourself instead
