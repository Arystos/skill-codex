# Consult Codex for a Second Opinion

Get Codex's perspective on a technical question, plan, or approach.

## Instructions

You are consulting Codex for a second opinion. This is read-only — no files will be modified.

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
