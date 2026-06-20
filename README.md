# skill-codex

[![npm version](https://img.shields.io/npm/v/skill-codex)](https://www.npmjs.com/package/skill-codex)
[![npm downloads](https://img.shields.io/npm/dm/skill-codex)](https://www.npmjs.com/package/skill-codex)
![CI](https://github.com/Arystos/skill-codex/actions/workflows/ci.yml/badge.svg)
![Coverage](https://img.shields.io/badge/coverage-80%25%2B%20enforced-brightgreen)
![Windows](https://img.shields.io/badge/Windows-0078D4?style=flat&logo=windows&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/arystos)

Use [OpenAI Codex](https://github.com/openai/codex) from [Claude Code](https://code.claude.com) for code review, task delegation, and second opinions — over MCP, using your existing Codex subscription. No API key required.

> **Two models rarely make the same mistake.** skill-codex lets Claude and Codex check each other's work — Claude plans and builds fast, Codex reviews with fresh eyes — from a single terminal. No API key, no second window, no copy-paste.

![skill-codex — a 20-second tour](docs/demo-trailer.gif)

```shell
npx skill-codex setup   # then restart Claude Code
```

<details>
<summary><b>Table of contents</b></summary>

- [Why?](#why)
- [Why not just use Claude's own subagents?](#why-not-just-use-claudes-own-subagents)
- [How it compares](#how-it-compares)
- [See it in action](#see-it-in-action)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

</details>

## Why?

Claude Code and Codex CLI have different strengths. Claude excels at reasoning, architecture, and complex refactors. Codex is fast, thorough, and great at focused execution and review. **skill-codex** lets them work together from a single terminal — no second window, no copy-paste, no context loss.

* **`/codex-review`** — have Codex review your current changes as a second reviewer
* **`/codex-do`** — delegate well-scoped implementation tasks to Codex
* **`/codex-consult`** — get a second opinion on architecture or design decisions
* **`codex-bridge` agent skill** — auto-triggers on implementation/review/consult requests, no command needed
* **Auto-review hook** — a smart PostToolUse hook suggests review after significant changes
* **Live progress** — streams Codex's activity as MCP progress so long runs never look frozen (mirrored to a tail-able log under the OS temp dir — never pollutes your repo)
* **Subscription-first** — works with `codex login`, no `OPENAI_API_KEY` needed
* **Guardrails** — retry, timeout, anti-recursion, lock files, pre-flight checks

### Why not just use Claude's own subagents?

Because a subagent is the **same model**. When Claude reviews Claude, you inherit the same blind spots — it's grading its own homework. A *different* model family was trained differently, so its mistakes don't correlate with Claude's: it catches what Claude is confidently wrong about, and Claude catches what Codex gets wrong. That uncorrelated, cross-model check is the entire point — and skill-codex keeps Claude as the final judge, never blindly forwarding Codex's verdict.

### How it compares

| | skill-codex | Most Codex MCP bridges |
|---|---|---|
| Codex **subscription** auth (no `OPENAI_API_KEY`) | ✅ | ⚠️ often require an API key |
| **Windows** verified in CI (not just "should work") | ✅ 9-way matrix (Windows/macOS/Linux × Node 18/20/22) | ❌ usually Linux-only CI |
| **Live progress** so long runs never look frozen | ✅ MCP progress + tail-able log | ⚠️ varies |
| **Slash commands** (`/codex-review`, `/codex-do`, `/codex-consult`) | ✅ | ⚠️ some |
| **Auto-review hook** (PostToolUse) | ✅ | ❌ |
| **Agent skill** (auto-triggers, no command needed) | ✅ | ❌ |
| **Guardrails**: retry, timeout, anti-recursion, lock files | ✅ | ⚠️ partial |

*A snapshot, not a leaderboard — the Codex MCP space moves fast, so check each tool's current state. The point isn't "skill-codex wins everything"; it's that the operational details (subscription auth, real Windows support, never-frozen runs, guardrails) are where it focuses.*

## See it in action

The 20-second trailer is above. Each feature in motion:

<details>
<summary><b>▶ Feature demos</b> — review · delegate · consult · model &amp; effort · memory · guardrails · hook</summary>

### `/codex-review` — a different model reviews your diff and returns a verdict, with a bounded fix → re-review loop
![/codex-review demo](docs/demo-review.gif)

### `/codex-do` — delegate a bounded task; Codex writes it, Claude reviews the diff
![/codex-do demo](docs/demo-delegate.gif)

### `/codex-consult` — a second opinion on a design call (you keep the decision)
![/codex-consult demo](docs/demo-consult.gif)

### Model &amp; reasoning effort, per task — a cheap model for grunt work, high effort for hard reviews
![model and effort demo](docs/demo-models.gif)

### Session memory — pass the thread id back and Codex remembers across calls
![session memory demo](docs/demo-memory.gif)

### Never frozen, never runaway — live progress plus timeout / anti-recursion / lock-file guards, Windows-native
![guardrails demo](docs/demo-robust.gif)

### Auto-review hook — a nudge to run `/codex-review` after significant changes (trivial diffs are skipped)
![auto-review hook demo](docs/demo-hook.gif)

</details>

## Install

**Prerequisites**

* [Node.js](https://nodejs.org) ≥ 18
* [Claude Code](https://code.claude.com) installed and authenticated
* [Codex CLI](https://github.com/openai/codex) installed and logged in (`codex login`)

**Quick start**

```shell
# Option A: run directly (no global install)
npx skill-codex setup

# Option B: install globally, then setup
npm i -g skill-codex
skill-codex setup

# Restart Claude Code to load the MCP server, then use:
/codex-review              # Review uncommitted changes
/codex-do "write tests"    # Delegate a task to Codex
/codex-consult "approach?" # Get a second opinion
```

`setup` registers the MCP server (`~/.claude.json`), installs the slash commands (`~/.claude/commands/`), configures the auto-review hook, installs the `codex-bridge` agent skill (`~/.claude/skills/`), and verifies everything.

> **Tip:** add `.skill-codex.lock` to your `.gitignore`.

**Install as a plugin instead**

```shell
/plugin marketplace add Arystos/skill-codex
/plugin install skill-codex@skill-codex
```

The plugin bundles the MCP server (launched via `npx -y skill-codex mcp`), the slash commands, the agent skill, and the auto-review hook. Restart Claude Code after installing.

## Usage

```
You in Claude Code
  |
  |-- /codex-review        --> MCP tool --> codex exec --sandbox read-only       --> review findings
  |-- /codex-do "task"     --> MCP tool --> codex exec --sandbox workspace-write --> reviewed output
  +-- /codex-consult "q"   --> MCP tool --> codex exec --sandbox read-only       --> synthesized opinion
```

The MCP server spawns `codex exec` as a subprocess using your logged-in Codex session. Claude sees the output and critically evaluates it — **Codex is treated as a peer, not an authority**.

The slash commands are explicit entry points; the `codex-bridge` **agent skill** is the implicit one — Claude loads it automatically when your request matches a delegation, review, or consult pattern ("implement X", "review this diff", "second opinion on…"). Trivial tasks (< 50 lines, faster done directly) are out of scope.

<details>
<summary><b>Advanced: model, effort, sandbox, sessions &amp; native review</b></summary>

These `codex_exec` parameters are all optional — omit them and Codex uses its defaults:

* **`model`** — pick the Codex model (e.g. `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`). Route cheap tasks to a smaller model and escalate hard ones.
* **`reasoningEffort`** — how hard Codex thinks: `minimal` | `low` | `medium` | `high` | `xhigh`.
* **`sandbox`** — explicit policy (`read-only`, `workspace-write`, `danger-full-access`), overriding `mode`. Use `danger-full-access` only when you understand the risk.
* **`sessionId`** — resume a previous Codex session for multi-round memory. Each response includes the session's thread id; pass it back so Codex retains context — e.g. a follow-up review that checks whether *previously flagged* issues were fixed.
* **`review`** — run Codex's native diff-scoped reviewer (`codex exec review`), optionally targeting a branch (`reviewBase`) or commit (`reviewCommit`).

Full parameter list: [docs/CONFIGURATION.md](docs/CONFIGURATION.md#codex_exec-tool-parameters).

</details>

<details>
<summary><b>Example output</b></summary>

```
[read-only │ D:\myproject │ 21538 tok in (15744 cached) → 129 out]
  ✔ exec: powershell -Command 'git diff --cached'  (ok)

CRITICAL — src/auth/login.ts:42
Password comparison uses == instead of timing-safe comparison.

MEDIUM — src/api/routes.ts:18
Missing rate limiting on login endpoint.
```

The first line shows mode, working directory, and token usage. Activity lines show commands Codex executed (✔ ok, ✘ blocked/failed). The response content follows after a blank line.

</details>

## Configuration

Everything is optional. The most common knobs:

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_CODEX_TIMEOUT_MS` | `300000` (5 min) | Subprocess timeout |
| `SKILL_CODEX_MAX_RETRIES` | `3` | Retry count for transient errors |
| `SKILL_CODEX_WINDOWS_SANDBOX` | `unelevated` | Windows-only Codex sandbox mode |

The auto-review hook skips trivial diffs (docs-only, < 5 lines, whitespace) and forces review on security paths or large/cross-cutting changes, to preserve your Codex quota.

**Full reference** — all env vars, the complete smart-filter rules, edge-case behavior, and every `codex_exec` parameter: **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)**.

## Troubleshooting

**Setup says "Hook script not found"** — run `npm run build` first, then `npx skill-codex setup` again. The hook scripts live in the package root, not in `dist/`.

**`/codex-review` says "Unknown tool: codex_exec"** — restart Claude Code after setup. The MCP server only loads on startup.

**Codex keeps timing out** — increase it: `export SKILL_CODEX_TIMEOUT_MS=1200000` (20 min). Large codebases take longer.

**"Auth expired" but Codex works in another terminal** — the MCP server runs in its own process. Run `codex login` and restart Claude Code. On Windows the auth pre-check is skipped automatically (PowerShell profile errors cause false negatives); auth is still verified when Codex actually runs.

**Lock file blocking runs** — a crashed run can leave a stale `.skill-codex.lock`. It auto-cleans after 15 minutes, or delete it manually.

**Windows: "windows sandbox failed: spawn setup refresh" / Codex commands all blocked** — Codex's default *elevated* Windows sandbox fails to spawn shells on many setups ([openai/codex#24098](https://github.com/openai/codex/issues/24098), [#24259](https://github.com/openai/codex/issues/24259)). skill-codex pins `windows.sandbox=unelevated`, which spawns reliably. If your machine needs the elevated sandbox, set `SKILL_CODEX_WINDOWS_SANDBOX=elevated`.

## Development

```shell
git clone https://github.com/Arystos/skill-codex.git
cd skill-codex
npm install
npm run build
npm test
npm run test:coverage   # enforces the same 80%+ gate as CI
```

Security policy: [SECURITY.md](SECURITY.md). Uninstall: `npx skill-codex uninstall`.

## Inspired By

* [Dunqing/claude-codex-bridge](https://github.com/Dunqing/claude-codex-bridge) — retry logic, anti-recursion, output parsing
* [EpocheDrift/claude-codex-skill](https://github.com/EpocheDrift/claude-codex-skill) — subscription-first, delegation heuristics
* [incadawr/claude-codex-skill](https://github.com/incadawr/claude-codex-skill) — MCP server approach, auto-triggers

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md). If you find this useful, you can [support the project on Ko-fi](https://ko-fi.com/arystos).

## License

[MIT](LICENSE)
