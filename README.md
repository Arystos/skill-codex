# skill-codex

![npm](https://img.shields.io/npm/v/skill-codex)
![Windows](https://img.shields.io/badge/Windows-0078D4?style=flat&logo=windows&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/arystos)

A cross-platform [Claude Code](https://code.claude.com) skill that integrates [OpenAI Codex CLI](https://github.com/openai/codex) for code review, task delegation, and consultation. Uses your existing Codex subscription -- no API key required.

## Why?

Claude Code and Codex CLI have different strengths. Claude excels at reasoning, architecture, and complex refactors. Codex is fast, thorough, and great at focused execution and review. **skill-codex** lets them work together from a single terminal -- no second window, no copy-paste, no context loss.

* **`/codex-review`** -- Have Codex review your current changes as a second reviewer
* **`/codex-do`** -- Delegate well-scoped implementation tasks to Codex
* **`/codex-consult`** -- Get a second opinion on architecture or design decisions
* **Auto-review hook** -- Smart PostToolUse hook suggests review after significant changes
* **Subscription-first** -- Works with `codex login`, no `OPENAI_API_KEY` needed
* **Edge case handling** -- Retry logic, timeout, anti-recursion, lock files, pre-flight checks

## Prerequisites

* [Node.js](https://nodejs.org) >= 18
* [Claude Code](https://code.claude.com) installed and authenticated
* [Codex CLI](https://github.com/openai/codex) installed and logged in (`codex login`)

## Quick Start

```shell
# 1. Install and configure everything in one command
npx skill-codex setup

# 2. Restart Claude Code to load the MCP server

# 3. Use the commands in any project
/codex-review              # Review uncommitted changes
/codex-do "write tests"    # Delegate a task to Codex
/codex-consult "approach?" # Get a second opinion
```

The setup command:
1. Registers the MCP server in your Claude Code config (`~/.claude.json`)
2. Installs slash commands globally (`~/.claude/commands/`)
3. Configures the auto-review PostToolUse hook
4. Verifies everything works

> **Tip:** Add `.skill-codex.lock` to your `.gitignore`

## How It Works

```
You in Claude Code
  |
  |-- /codex-review        --> MCP tool --> codex exec (read-only) --> review findings
  |-- /codex-do "task"     --> MCP tool --> codex exec --full-auto --> reviewed output
  +-- /codex-consult "q"   --> MCP tool --> codex exec (read-only) --> synthesized opinion
```

The MCP server spawns `codex exec` as a subprocess, using your logged-in Codex session. Claude sees the output and critically evaluates it -- **Codex is treated as a peer, not an authority**.

### Auto-review

After significant code changes (3+ files, 100+ lines, security-related paths), the PostToolUse hook suggests running `/codex-review`. Trivial changes (docs-only, < 5 lines, whitespace) are skipped to preserve your Codex quota.

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_CODEX_TIMEOUT_MS` | `600000` (10 min) | Subprocess timeout |
| `SKILL_CODEX_MAX_RETRIES` | `3` | Retry count for transient errors |
| `SKILL_CODEX_DEBUG` | -- | Enable debug logging to stderr |

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
| Codex hangs | Killed after timeout (SIGTERM then SIGKILL) |
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
```

## Troubleshooting

**Setup says "Hook script not found"**
Run `npm run build` first, then `npx skill-codex setup` again. The hook scripts live in the package root, not in `dist/`.

**`/codex-review` says "Unknown tool: codex_exec"**
Restart Claude Code after running setup. The MCP server only loads on startup.

**Codex keeps timing out**
Increase the timeout: `export SKILL_CODEX_TIMEOUT_MS=1200000` (20 min). Large codebases can take longer.

**"Auth expired" but Codex works in another terminal**
The MCP server runs in its own process. Run `codex login` and restart Claude Code.

**Lock file blocking runs**
If a previous run crashed, a stale `.skill-codex.lock` may remain. It auto-cleans after 15 minutes, or delete it manually.

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
