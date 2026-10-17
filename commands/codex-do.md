---
description: Delegate a well-scoped implementation task to Codex, with a file allowlist and a verification command
argument-hint: "[--effort <level>] [--model <name>] <task>"
---

# Delegate Task to Codex

Delegate a well-scoped implementation task to Codex. Codex may touch only an agreed list of files, and the task is done only when a verification command passes.

## Instructions

You are delegating an implementation task to Codex. Follow these steps:

0. **Extract optional flags from `$ARGUMENTS` first**, then treat the remaining text as the task:
   - `--effort <level>` — Codex reasoning effort. Valid: `minimal`, `low`, `medium`, `high`, `xhigh`. If an invalid level is given, list the valid ones and ask — do not guess.
   - `--model <name>` — Codex model. Passed through as-is; an explicit `--model` always wins.
   - Strip any flags you find; what's left is the task parsed in step 1.
   - **`--effort` omitted:** do NOT pass `reasoningEffort`. Codex uses its configured default (`~/.codex/config.toml`).
   - **`--model` omitted:** choose the model yourself from the list in the `codex_exec` tool's `model` parameter (only those slugs exist on this account). Match the task: the strongest listed model for multi-file or tricky work, a fast one for small mechanical edits. If no list is shown or you are unsure, omit `model` so Codex uses the user's default. If Codex rejects the model, the call falls back to the default on its own.

1. **Parse the task** from `$ARGUMENTS`. If the argument is vague or missing, ask the user to be more specific before proceeding.

2. **Evaluate if the task is suitable for delegation**:
   - **Good for Codex**: repetitive bulk changes, boilerplate generation, test writing for existing code, migration scripts, file format conversions, well-defined single-file edits
   - **Keep for yourself**: architectural decisions, cross-module refactoring, tasks requiring deep conversation context, ambiguous requirements, and trivial edits you'd finish faster yourself than you can write a spec for
   - **Requires git.** Run `git rev-parse --is-inside-work-tree`. Delegation needs git to detect every changed file. In a project without git (e.g. Diversion), do not delegate: say so and offer to do the task yourself.
   - If the task is poorly scoped, explain why and suggest how to break it down.

3. **Fix the scope before delegating.** The task spec must contain both:
   - **Allowed files** — the exact paths Codex may create, modify or delete. List new files too.
   - **Verification command** — one command that defines "done" and prints pass/fail, e.g. a test run or a build (`npm test -- path/to/test`, `cargo test module`, `npm run build`).

   Derive both from the task and the codebase. If you cannot name either one with confidence, ask the user. Show both to the user in your delegation message.

4. **Prepare a precise, self-contained prompt** for Codex. Include:
   - The specific change required, with examples if helpful
   - "You may modify ONLY these files: <allowed files>. Do not create, edit or delete any other file. If the task seems to need another file, stop and say which one and why instead of editing it."
   - "Done means this command passes: `<verification command>`."
   - Constraints (language, framework, coding style, naming conventions)

5. **Call the `codex_exec` MCP tool** with:
   - `prompt`: the prepared prompt
   - `mode`: "full-auto"
   - `requireGit`: true
   - `reasoningEffort`: the parsed `--effort` level — **only if provided in step 0** (otherwise omit)
   - `model`: the parsed `--model` name if given in step 0; otherwise the model you chose in step 0, or omit it

6. **Check for drift.** Run `git status --short` to list ALL changed files, including **newly-created files** (lines starting with `??`) — `git diff` alone is blind to untracked files. Compare that list with the allowed files:
   - Any file changed, created or deleted outside the list is **drift**. Report each one by path, with what changed.
   - Never accept drift silently. Offer to revert it (`git checkout -- <file>` for tracked files, delete new files), or to keep a specific file if the user approves it.

7. **Review the in-scope changes critically.** Run `git diff` for modifications to tracked files, and **read any new untracked files directly**. Check that the change does what the task asked, with no correctness bugs, security issues or regressions. Skip style nits.

8. **Run the verification command yourself** and show its output. Do not rely on Codex's claim that it passed.

9. **Present the result**:
   - Verification: the command and whether it passed, with the output.
   - Drift: the out-of-scope files and what you did about them, or "none".
   - What was done correctly, and what needs adjustment.
   - The task is **done only if verification passes and no unapproved drift remains.** Otherwise, offer to fix it yourself or re-delegate with refined instructions.

## Important

- Codex runs in **full-auto mode** — it CAN modify files in the workspace
- Every delegation has an **allowed file list** and a **verification command** — no exceptions
- Always run `git status --short` **and** `git diff` after Codex runs — `git status` catches new files that `git diff` misses
- Codex is a **peer, not an authority** — you run the verification and you decide what is accepted
- For complex multi-file tasks, consider doing it yourself instead
