# skill-codex

[![npm version](https://img.shields.io/npm/v/skill-codex)](https://www.npmjs.com/package/skill-codex)
[![npm downloads](https://img.shields.io/npm/dm/skill-codex)](https://www.npmjs.com/package/skill-codex)
![CI](https://github.com/Arystos/skill-codex/actions/workflows/ci.yml/badge.svg)
<!-- After enabling the repo on codecov.io (see DISTRIBUTION.md), uncomment:
[![codecov](https://codecov.io/gh/Arystos/skill-codex/graph/badge.svg)](https://codecov.io/gh/Arystos/skill-codex) -->
![Coverage](https://img.shields.io/badge/coverage-80%25%2B%20enforced-brightgreen)
![Windows](https://img.shields.io/badge/Windows-0078D4?style=flat&logo=windows&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/arystos)

A cross-platform [Claude Code](https://code.claude.com) skill that integrates [OpenAI Codex CLI](https://github.com/openai/codex) for code review, task delegation, and consultation. Uses your existing Codex subscription -- no API key required.

> **Two models rarely make the same mistake.** skill-codex lets Claude and Codex check each other's work -- Claude plans and builds fast, Codex reviews with fresh eyes -- from a single terminal, using the Codex subscription you already pay for. No API key, no second window, no copy-paste.

<!-- Demo GIF: record a ~20s clip of `/codex-review` catching a real bug, save it to docs/demo.gif, then uncomment the next line:
![skill-codex demo](docs/demo.gif)
-->

## Why?

Claude Code and Codex CLI have different strengths. Claude excels at reasoning, architecture, and complex refactors. Codex is fast, thorough, and great at focused execution and review. **skill-codex** lets them work together from a single terminal -- no second window, no copy-paste, no context loss.

* **`/codex-review`** -- Have Codex review your current changes as a second reviewer
* **`/codex-do`** -- Delegate well-scoped implementation tasks to Codex
* **`/codex-consult`** -- Get a second opinion on architecture or design decisions
* **`codex-bridge` agent skill** -- Auto-triggers on implementation/review/consult requests so Claude reaches for Codex without an explicit slash command
* **Auto-review hook** -- Smart PostToolUse hook suggests review after significant changes
* **Live progress** -- Streams Codex's activity (running commands, file edits, elapsed time) as MCP progress so long runs never look frozen; also mirrored to a tail-able log file (under the OS temp dir, path printed at run start -- never pollutes your repo)
* **Subscription-first** -- Works with `codex login`, no `OPENAI_API_KEY` needed
* **Edge case handling** -- Retry logic, timeout, anti-recursion, lock files, pre-flight checks

### Why not just use Claude's own subagents?

Because a subagent is the **same model**. When Claude reviews Claude, you inherit the same blind spots -- it's grading its own homework. A *different* model family was trained differently, so its mistakes don't correlate with Claude's: it catches what Claude is confidently wrong about, and Claude catches what Codex gets wrong. That uncorrelated, cross-model check is the entire point -- and skill-codex keeps Claude as the final judge, never blindly forwarding Codex's verdict.

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

*A snapshot, not a leaderboard -- the Codex MCP space moves fast, so check each tool's current state. The point isn't "skill-codex wins everything"; it's that the operational details (subscription auth, real Windows support, never-frozen runs, guardrails) are where it focuses.*

## Prerequisites

* [Node.js](https://nodejs.org) >= 18
* [Claude Code](https://code.claude.com) installed and authenticated
* [Codex CLI](https://github.com/openai/codex) installed and logged in (`codex login`)

## Quick Start

```shell
# Option A: Run directly (no global install)
npx skill-codex setup

# Option B: Install globally, then setup
npm i -g skill-codex
skill-codex setup

# Restart Claude Code to load the MCP server, then use:
/codex-review              # Review uncommitted changes
/codex-do "write tests"    # Delegate a task to Codex
/codex-consult "approach?" # Get a second opinion
```

The setup command:
1. Registers the MCP server in your Claude Code config (`~/.claude.json`)
2. Installs slash commands globally (`~/.claude/commands/`)
3. Configures the auto-review PostToolUse hook
4. Installs the `codex-bridge` agent skill (`~/.claude/skills/`)
5. Verifies everything works

> **Tip:** Add `.skill-codex.lock` to your `.gitignore`

## How It Works

```
You in Claude Code
  |
  |-- /codex-review        --> MCP tool --> codex exec --sandbox read-only       --> review findings
  |-- /codex-do "task"     --> MCP tool --> codex exec --sandbox workspace-write --> reviewed output
  +-- /codex-consult "q"   --> MCP tool --> codex exec --sandbox read-only       --> synthesized opinion
```

The MCP server spawns `codex exec` as a subprocess, using your logged-in Codex session. Claude sees the output and critically evaluates it -- **Codex is treated as a peer, not an authority**.

### Advanced: sandbox control & session memory

The `codex_exec` tool accepts two optional parameters beyond `mode`:

* **`sandbox`** -- the explicit Codex sandbox policy (`read-only`, `workspace-write`, or `danger-full-access`), overriding the `mode` default. Use `danger-full-access` only when you understand the risk.
* **`sessionId`** -- resume a previous Codex session for multi-round memory. Each response includes the session's thread id; pass it back as `sessionId` so Codex retains context -- e.g. a follow-up review that checks whether *previously flagged* issues were fixed, instead of re-discovering them.

### Auto-review

After significant code changes (3+ files, 100+ lines, security-related paths), the PostToolUse hook suggests running `/codex-review`. Trivial changes (docs-only, < 5 lines, whitespace) are skipped to preserve your Codex quota.

### Agent skill (auto-trigger)

The slash commands are explicit, on-demand entry points. The `codex-bridge` agent skill is the implicit one: it installs to `~/.claude/skills/` and Claude loads it automatically when your request matches a delegation, review, or consult pattern (e.g. "implement X", "generate tests for", "review this diff", "second opinion on this approach"). It maps the same three workflows -- delegate, review, consult -- onto the `codex_exec` tool, so you get Codex collaboration without remembering a command. Trivial tasks (< 50 lines, faster done directly) are explicitly out of scope.

### Example Output

When Codex runs, the MCP tool returns a structured plain-text response:

```
[read-only │ D:\myproject │ 21538 tok in (15744 cached) → 129 out]
  ✔ exec: powershell -Command 'git diff --cached'  (ok)

CRITICAL — src/auth/login.ts:42
Password comparison uses == instead of timing-safe comparison.

MEDIUM — src/api/routes.ts:18
Missing rate limiting on login endpoint.
```

The first line shows mode, working directory, and token usage. Activity lines show commands Codex executed (with status icons: ✔ ok, ✘ blocked/failed). The response content follows after a blank line.

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_CODEX_TIMEOUT_MS` | `300000` (5 min) | Subprocess timeout |
| `SKILL_CODEX_MAX_RETRIES` | `3` | Retry count for transient errors |
| `SKILL_CODEX_LOG` | `<os-temp>/skill-codex/<workspace>.log` | Absolute path override for the live, tail-able per-run log |
| `SKILL_CODEX_DEBUG` | -- | Enable debug logging to stderr |
| `SKILL_CODEX_WINDOWS_SANDBOX` | `unelevated` | Windows only — Codex `windows.sandbox` mode (`unelevated`/`elevated`) |

### Smart Filter Thresholds

| Condition | Action | Rationale |
|-----------|--------|-----------|
| < 5 lines changed | Skip | Not worth the Codex call |
| All files are `.md`/`.txt`/`.rst` | Skip | Documentation-only |
| Whitespace or import-only diff | Skip | Formatting change |
| Path contains `auth`/`security`/`crypto` | **Force review** | Security-sensitive |
| > 100 lines changed | **Force review** | High-impact change |
| > 3 files changed | **Force review** | Cross-cutting change |

## Edge Cases Handled

| Scenario | What Happens |
|----------|-------------|
| Codex not installed | Clear error with install instructions |
| Auth expired | Advises `codex login`, no retry |
| Network down | Retries 3x with exponential backoff |
| Rate limited (429) | Retries with backoff + jitter |
| Codex hangs | Killed after timeout (SIGTERM+SIGKILL on Unix, immediate kill on Windows) |
| Concurrent runs | Lock file prevents conflicts (stale after 15min) |
| Recursive calls | `SKILL_CODEX_DEPTH` limit prevents infinite loops |
| Trivial changes | Smart filter skips auto-review |
| Empty Codex output | Retries once, then reports clearly |

## Project Structure

```
skill-codex/
|-- src/
|   |-- index.ts              # MCP server entry point
|   |-- server.ts             # MCP server + tool registration
|   |-- tools/codex-exec.ts   # codex_exec tool handler
|   |-- runner/               # exec-runner, retry, timeout, output parser
|   |-- guards/               # pre-flight checks (binary, auth, git, recursion, lock)
|   |-- filter/               # smart diff filter for auto-review
|   |-- lock/                 # lock file with stale detection
|   |-- errors/               # typed error classes
|   |-- config/               # constants, paths, platform utils
|   +-- util/                 # platform detection, truncation
|-- commands/
|   |-- codex-review.md       # /codex-review slash command
|   |-- codex-do.md           # /codex-do slash command
|   +-- codex-consult.md      # /codex-consult slash command
|-- hooks/
|   |-- post-tool-use-review.sh   # Auto-review hook (macOS/Linux)
|   +-- post-tool-use-review.ps1  # Auto-review hook (Windows)
|-- skills/
|   +-- codex-bridge/SKILL.md # Agent skill (auto-triggers delegation/review/consult)
|-- setup/                    # npx skill-codex setup installer
|-- bin/                      # CLI entry point
+-- __tests__/                # vitest test suite
```

## Uninstall

```shell
npx skill-codex uninstall
```

## Development

```shell
git clone https://github.com/Arystos/skill-codex.git
cd skill-codex
npm install
npm run build
npm test
npm run test:coverage   # enforces the same 80%+ gate as CI
```

## Troubleshooting

**Setup says "Hook script not found"**
Run `npm run build` first, then `npx skill-codex setup` again. The hook scripts live in the package root, not in `dist/`.

**`/codex-review` says "Unknown tool: codex_exec"**
Restart Claude Code after running setup. The MCP server only loads on startup.

**Codex keeps timing out**
Increase the timeout: `export SKILL_CODEX_TIMEOUT_MS=1200000` (20 min). Large codebases can take longer.

**"Auth expired" but Codex works in another terminal**
The MCP server runs in its own process. Run `codex login` and restart Claude Code. On Windows, the auth pre-check is skipped automatically (PowerShell profile errors can cause false negatives); auth is still verified when Codex actually runs.

**Lock file blocking runs**
If a previous run crashed, a stale `.skill-codex.lock` may remain. It auto-cleans after 15 minutes, or delete it manually.

**Windows: "windows sandbox failed: spawn setup refresh" / Codex commands all blocked**
Codex's default *elevated* Windows sandbox fails to spawn shells on many setups ([openai/codex#24098](https://github.com/openai/codex/issues/24098), [#24259](https://github.com/openai/codex/issues/24259)). skill-codex works around this by pinning `windows.sandbox=unelevated`, which spawns reliably. If your machine needs the elevated sandbox instead, set `SKILL_CODEX_WINDOWS_SANDBOX=elevated`.

## Inspired By

* [Dunqing/claude-codex-bridge](https://github.com/Dunqing/claude-codex-bridge) -- retry logic, anti-recursion, output parsing
* [EpocheDrift/claude-codex-skill](https://github.com/EpocheDrift/claude-codex-skill) -- subscription-first, delegation heuristics
* [incadawr/claude-codex-skill](https://github.com/incadawr/claude-codex-skill) -- MCP server approach, auto-triggers

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

If you find this useful, consider supporting the project:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/arystos)

## License

MIT
