---
description: Get Codex's second opinion on a technical question or design
argument-hint: "[--effort <level>] [--model <name>] <question>"
---

# Consult Codex for a Second Opinion

Get Codex's perspective on a technical question, plan, or approach.

## Instructions

You are consulting Codex for a second opinion. This is read-only — no files will be modified.

0. **Extract optional flags from `$ARGUMENTS` first**, then treat the remaining text as the question:
   - `--effort <level>` — Codex reasoning effort. Valid: `minimal`, `low`, `medium`, `high`, `xhigh`. If an invalid level is given, list the valid ones and ask — do not guess.
   - `--model <name>` — Codex model. Passed through as-is; an explicit `--model` always wins.
   - Strip any flags you find; what's left is the question parsed in step 1.
   - **`--effort` omitted:** do NOT pass `reasoningEffort`. Codex uses its configured default (`~/.codex/config.toml`).
   - **`--model` omitted:** choose the model yourself from the list in the `codex_exec` tool's `model` parameter (only those slugs exist on this account). Match the question: a fast listed model for a quick factual check, the strongest one for architecture or design trade-offs. If no list is shown or you are unsure, omit `model` so Codex uses the user's default. If Codex rejects the model, the call falls back to the default on its own.

1. **Parse the question** from `$ARGUMENTS`. This could be:
   - A technical question about the codebase
   - A plan you want validated before implementing
   - An architecture decision you want a second perspective on
   - A debugging hypothesis you want challenged
   - A technology choice comparison

2. **Prepare a focused prompt** for Codex. Include:
   - The specific question or plan to evaluate
   - Relevant context: file paths, code snippets, constraints
   - What kind of feedback you want (validation, alternatives, risks, tradeoffs)

3. **Call the `codex_exec` MCP tool** with:
   - `prompt`: "Provide your analysis and recommendation on the following question. Consider tradeoffs, alternatives, and potential risks. Be specific and cite concrete examples where possible.\n\n<question with context>"
   - `mode`: "exec"
   - `reasoningEffort`: the parsed `--effort` level — **only if provided in step 0** (otherwise omit)
   - `model`: the parsed `--model` name if given in step 0; otherwise the model you chose in step 0, or omit it

4. **Synthesize both perspectives** for the user:
   - Present Codex's analysis
   - Provide your own independent analysis
   - Where you agree and why
   - Where you disagree and why (with evidence)
   - Your recommended path forward with reasoning

## Important

- Codex runs in **read-only mode** — it cannot modify files
- This is a **consultation, not a delegation** — the final decision rationale comes from this conversation
- If you and Codex strongly disagree, present both arguments fairly and let the user decide
