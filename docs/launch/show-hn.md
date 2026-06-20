# Show HN draft

**Title** (≤80 chars — HN strips emoji/fluff):
```
Show HN: Skill-Codex – use OpenAI Codex from Claude Code with your subscription
```

**URL:** https://github.com/Arystos/skill-codex

**Body** (post as the first comment):
```
I run Claude Code as my main coding agent, but I kept wanting a second model to
check its work — Claude has a bias to ship, and asking the same model to review
its own code is grading its own homework. Two different model families rarely
make the same mistake, so the second opinion actually catches things.

skill-codex is a small MCP server + slash commands that lets Claude Code call
the OpenAI Codex CLI in the same session:

- /codex-review — Codex reviews your diff and returns APPROVED/WARNING/BLOCKED,
  with a bounded fix→re-review loop. Claude stays the final judge.
- /codex-do — delegate a bounded implementation task to Codex.
- /codex-consult — get a second opinion on a design/approach.
- An agent skill so Claude reaches for Codex without you typing a command.

What I tried to get right (the operational stuff most bridges skip):
- Subscription auth, no API key. It uses your existing `codex login`, so there's
  no metered billing and no surprise bill.
- Windows-native. Tested in CI on Windows/macOS/Linux × Node 18/20/22, and it
  works around Codex's broken elevated Windows sandbox (most bridges punt to WSL).
- It never looks frozen (live progress streamed as MCP notifications) and won't
  run away (recursion depth limit, per-call timeout, lock files).

Why not just use Claude's own subagents? Because a subagent is the same model —
same blind spots. The whole point is an *uncorrelated* reviewer.

Install: `npx skill-codex setup` then restart Claude Code. MIT, no telemetry.
It also runs from Codex/Gemini/Copilot CLIs via the shared skill format.

It's not magic — Codex's review is a suggestion, and you (or Claude) make the
call. Feedback welcome, especially on the Windows path and the review loop.
```

Notes:
- Post Tue–Thu morning US time for best visibility.
- Be in the thread to answer; the most common pushback will be "why not subagents"
  (answer above) and "is this vibecoded" (point at the tests + CI matrix).
