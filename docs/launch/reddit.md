# Reddit drafts

Reddit punishes bare "I built X" promos and anything that reads "vibecoded."
Lead with a real workflow + a concrete catch, link at the end, be present in comments.
Best subs: r/ClaudeCode and r/codex (then r/ChatGPTCoding). Post to one at a time.

---

## r/ClaudeCode

**Title:**
```
I wired Claude Code and Codex to check each other's work in one session (no API key)
```

**Body:**
```
The thing that finally made multi-model worth it for me: two different models
rarely make the same mistake. Claude writes fast but has a bias to ship; when I
let Codex review the same diff, it flags the edge cases Claude waved through —
and it's a different model family, so the misses don't correlate.

I packaged the workflow I'd been doing by hand (copy-pasting between two
terminals) into a small Claude Code skill, skill-codex:

- /codex-review → Codex reviews the diff, returns APPROVED/WARNING/BLOCKED, and
  I can run a bounded fix→re-review loop. Claude stays the judge — it doesn't
  blindly forward Codex's verdict.
- /codex-do → hand a bounded task to Codex.
- /codex-consult → second opinion on an approach.
- Plus an agent skill so Claude reaches for Codex automatically.

Stuff I cared about:
- Uses your Codex subscription (codex login) — no API key, no metered billing.
- Actually works on Windows (tested in CI on Win/macOS/Linux), including the
  Codex elevated-sandbox spawn bug that usually forces WSL.
- Live progress so it never looks frozen; recursion/timeout/lock guards so it
  can't run away and burn tokens.
- Optional model + reasoning-effort per call (e.g. cheap model for grunt work,
  high effort for a gnarly review). Omit them and it just uses your defaults.

It's MIT, install is `npx skill-codex setup`. Not claiming it replaces Claude —
I still drive with Claude and use Codex as the second brain.

Repo: https://github.com/Arystos/skill-codex
Curious how others split work between the two.
```

---

## r/codex

**Title:**
```
Call Codex from Claude Code (or any agent) with your ChatGPT plan — MCP bridge, MIT
```

**Body:**
```
Built a bridge that exposes `codex exec` to Claude Code (and Codex/Gemini/Copilot
CLIs) over MCP, using subscription auth — no OPENAI_API_KEY, no metered billing.

Why I find it useful: Codex is a great reviewer. Letting it review another model's
diff (or do a focused implementation) catches things the original model missed,
because the mistakes don't correlate. It also exposes Codex's native
`codex exec review` (diff-scoped, --base/--commit), plus model and reasoning-effort
selection per call.

Operational details I sweated:
- Windows-native (CI on Win/macOS/Linux × Node 18/20/22; works around the
  elevated-sandbox spawn failure).
- Live progress (never looks frozen), and recursion/timeout/lock guards.
- Session resume for multi-round context.

MIT, `npx skill-codex setup`. Repo: https://github.com/Arystos/skill-codex
Feedback welcome on the review flow and the Windows handling.
```

Notes:
- Swap in a real before/after (a bug Codex caught that Claude missed) once you
  have the demo GIF — concrete catches travel furthest.
- Don't cross-post identically the same hour; space them out.
