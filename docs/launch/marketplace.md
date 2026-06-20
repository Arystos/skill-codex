# Anthropic plugin marketplace submission

This is the highest-trust distribution channel, but also the most work — and
there's an honest gap to close first.

## Reality check / the gap
The official directory (`anthropics/claude-plugins-official`) lists **Claude Code
plugins**, which expect a plugin structure (a `.claude-plugin/plugin.json`
manifest declaring the MCP server, commands, skills, and hooks). skill-codex
currently installs itself imperatively via `npx skill-codex setup` (writing into
`~/.claude`), which is a different model.

So before submitting, skill-codex likely needs a **plugin manifest** added so it
can be installed the marketplace way (`/plugin install`) in addition to the npm
setup. That's a real (small-to-medium) task, not just a form.

**→ Verify the current requirements** at:
- https://github.com/anthropics/claude-plugins-official (README + submission process)
- Claude Code docs: "Plugins" / "Plugin marketplaces"

(Want me to add a `.claude-plugin/plugin.json` manifest as a v0.8 task so the same
repo works both as an npm install and a marketplace plugin? Say the word.)

## Submission blurb (once it's plugin-shaped)
```
Name: skill-codex
Tagline: Use OpenAI Codex from Claude Code — review, delegate, consult — with your subscription.
Description:
skill-codex bridges Claude Code to the OpenAI Codex CLI over MCP for cross-model
code review, task delegation, and second opinions, using Codex subscription auth
(no API key). A different model family catches what Claude misses. Ships
/codex-review (verdict + bounded fix loop), /codex-do, /codex-consult, an
auto-trigger agent skill, and a PostToolUse review hook. Windows-native (CI on
Win/macOS/Linux), live progress, recursion/timeout/lock guards. MIT.
Categories: developer-tools, code-review, ai
Repo: https://github.com/Arystos/skill-codex
npm: skill-codex
```

## Security/quality notes to include (the directory scores these)
- MIT licensed, no telemetry.
- 166 tests, CI matrix (Win/macOS/Linux × Node 18/20/22), 80% coverage gate.
- Read-only by default; `danger-full-access` is opt-in and gated.
- Anti-recursion + timeout + lock files; subscription auth (no key stored).
