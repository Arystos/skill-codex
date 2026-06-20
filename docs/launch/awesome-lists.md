# Awesome-list submissions

Getting listed is usually a small PR (add a line) or a recommendation issue.
Read each repo's CONTRIBUTING/format first — match their exact style. Below are
ready entries; tweak punctuation to fit each list.

## Targets (check each is still active before submitting)
- hesreallyhim/awesome-claude-code
- ccplugins/awesome-claude-code-plugins
- ComposioHQ/awesome-claude-plugins
- hashgraph-online/awesome-codex-plugins  (Codex-specific — strong fit)

## One-line entry (Markdown link-list style)
```
- [skill-codex](https://github.com/Arystos/skill-codex) — Call the OpenAI Codex CLI from Claude Code (review, delegate, consult) using your Codex subscription — no API key. Windows-native, live progress, MIT.
```

## Table-style entry (name | description | link)
```
| skill-codex | Cross-model bridge: Claude Code ↔ Codex CLI for second-opinion review, task delegation, and consult. Subscription auth (no API key), Windows-tested, MCP + slash commands + agent skill. | https://github.com/Arystos/skill-codex |
```

## Recommendation-issue text (for lists that take issues, not PRs)
```
Title: Add skill-codex (Claude Code ↔ OpenAI Codex bridge)

skill-codex (https://github.com/Arystos/skill-codex, MIT) lets Claude Code use
the OpenAI Codex CLI for code review, task delegation, and second opinions over
MCP — with subscription auth (no API key). Differentiators: genuinely Windows-
native (CI matrix on Win/macOS/Linux), live progress so long runs don't look
frozen, recursion/timeout/lock guards, and a structured review verdict with a
bounded fix loop. Ships slash commands + an auto-trigger agent skill. On npm as
`skill-codex` (npx skill-codex setup).
```

## How to submit a PR (per repo)
```
gh repo fork <owner>/<repo> --clone
# edit the list file, add the entry in the correct section, keep alphabetical if they do
git checkout -b add-skill-codex
git commit -am "Add skill-codex"
git push -u origin add-skill-codex
gh pr create --repo <owner>/<repo> --fill
```
(Want me to open these PRs for you? I'll need you to confirm each target repo +
the exact section, since these are other people's repos with their own rules.)
