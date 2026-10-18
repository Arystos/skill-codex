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
- [Security scanning](#security-scanning-skillspector)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

</details>

## Why?

Claude Code and Codex CLI have different strengths. Claude excels at reasoning, architecture, and complex refactors. Codex is fast, thorough, and great at focused execution and review. **skill-codex** lets them work together from a single terminal — no second window, no copy-paste, no context loss.

* **`/codex-review`** — Codex reviews your current changes; Claude then audits each finding against the code (keep / rewrite / drop / new, with evidence) before the verdict, so false positives are filtered and missed issues surfaced
* **`/codex-do`** — delegate well-scoped implementation tasks to Codex
* **`/codex-consult`** — get a second opinion on architecture or design decisions
* **`codex-bridge` agent skill** — Claude decides on its own when to ask Codex for a review or a second opinion, and delegates scoped tasks on request; no command needed
* **Auto-review hook** — a smart PostToolUse hook suggests review after significant changes
* **Live progress** — streams Codex's activity as MCP progress so long runs never look frozen (mirrored to a tail-able log under the OS temp dir — never pollutes your repo)
* **Subscription-first** — works with `codex login`, no `OPENAI_API_KEY` needed
* **Guardrails** — retry, timeout, anti-recursion, lock files, pre-flight checks

### Why not just use Claude's own subagents?

Because a subagent is the **same model**. When Claude reviews Claude, you inherit the same blind spots — it's grading its own homework. A *different* model family was trained differently, so its mistakes don't correlate with Claude's: it catches what Claude is confidently wrong about, and Claude catches what Codex gets wrong. That uncorrelated, cross-model check is the entire point — and skill-codex keeps Claude as the final judge, never blindly forwarding Codex's verdict.

### How it compares

| | skill-codex | Most Codex MCP bridges |
|---|---|---|
| **Windows** verified in CI (not just "should work") | ✅ 9-way matrix (Windows/macOS/Linux × Node 20/22/24) | ❌ usually Linux-only CI |
| **git and builds work inside Codex's Windows sandbox** (no WSL needed) | ✅ under `elevated`, skill-codex trusts the workspace repo for git (re-tested on codex-cli 0.163) | ⚠️ inherit your Codex backend; under `elevated`, git rejects your repo |
| **Live progress** so long runs never look frozen | ✅ MCP progress + tail-able log | ⚠️ varies |
| **Slash commands** (`/codex-review`, `/codex-do`, `/codex-consult`) | ✅ | ⚠️ some |
| **Auto-review hook** (PostToolUse) | ✅ | ❌ |
| **Agent skill** (auto-triggers, no command needed) | ✅ | ❌ |
| **Guardrails**: retry, timeout, anti-recursion, lock files | ✅ | ⚠️ partial |
| Codex **subscription** auth (`codex login`, no `OPENAI_API_KEY`) | ✅ | ✅ table stakes — the official Codex MCP & OpenAI plugin do this too |

*A snapshot, not a leaderboard — the Codex MCP space moves fast, so check each tool's current state. Subscription auth (no API key) is **table stakes**: the official Codex MCP server and OpenAI's own plugin use your `codex login` too, so it's not a differentiator — it's just reassurance you won't get a metered API bill. Where skill-codex actually focuses is the operational details: real, CI-verified Windows support (incl. a Windows sandbox mode in which git works), never-frozen runs, guardrails, and an act-on-it review workflow.*

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

The slash commands are explicit entry points; the `codex-bridge` **agent skill** is the implicit one. Claude uses it without being asked in two cases: an independent review before it calls a non-trivial change done (roughly 50+ changed lines, or auth, security, payments, crypto, concurrency or migrations), and a consult when a bug survives two fix attempts. It always announces the call. It also loads on requests such as "review this diff", "second opinion on…" or "generate tests for X", and delegates only when it can name the allowed files and a verification command. Small edits and design decisions stay with Claude. To keep Claude from calling Codex on its own, add `disable-model-invocation: true` to the installed `SKILL.md` frontmatter; the slash commands keep working.

<details>
<summary><b>Advanced: model, effort, sandbox, sessions &amp; native review</b></summary>

These `codex_exec` parameters are all optional — omit them and Codex uses its defaults:

* **`model`** — Claude picks the Codex model per task. At startup the server reads the models your ChatGPT plan offers (`codex debug models`) and lists them in the tool description, so Claude routes reviews and multi-file work to the strongest one and quick questions to a fast one. Pass `--model <name>` to a command to force a model. If Codex rejects a model, the call falls back to your configured default and says so.
* **`reasoningEffort`** — how hard Codex thinks: `minimal` | `low` | `medium` | `high` | `xhigh`.
* **`sandbox`** — explicit policy (`read-only`, `workspace-write`, `danger-full-access`), overriding `mode`. Use `danger-full-access` only when you understand the risk.
* **`sessionId`** — resume a previous Codex session for multi-round memory. Each response includes the session's thread id; pass it back so Codex retains context — e.g. a follow-up review that checks whether *previously flagged* issues were fixed.
* **`review`** — run Codex's native diff-scoped reviewer (`codex exec review`), optionally targeting a branch (`reviewBase`) or commit (`reviewCommit`).
* **`addDirs`** — extra directories Codex may **write** to besides `cwd` (`codex exec --add-dir`), for monorepo tasks that span packages. Off by default. Each entry is absolute or relative to `cwd` and must exist. It needs a writable sandbox (`mode: "full-auto"` or `sandbox: "workspace-write"`), and it widens what Codex can modify: pass only the directories the task needs. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md#extra-writable-roots-adddirs).
* **`outputSchema`** — an inline JSON Schema for Codex's final message (`codex exec --output-schema`), e.g. review findings as `{severity, file, line, fix}` objects instead of prose. The response shows that message as a JSON block. Codex uses OpenAI strict mode, so every object needs `"additionalProperties": false` and all its properties in `required`. Not supported with `review`.

Model routing recipes: [docs/CONFIGURATION.md](docs/CONFIGURATION.md#model-routing-recipes).

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
| `SKILL_CODEX_WINDOWS_SANDBOX` | your `[windows] sandbox`, else `unelevated` | Windows-only Codex sandbox mode: `elevated`, `unelevated` or `mxc` |

The auto-review hook skips trivial diffs (docs-only, < 5 lines, whitespace) and forces review on security paths or large/cross-cutting changes, to preserve your Codex quota.

**Full reference** — all env vars, the complete smart-filter rules, edge-case behavior, and every `codex_exec` parameter: **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)**.

## Troubleshooting

**Setup says "Hook script not found"** — run `npm run build` first, then `npx skill-codex setup` again. The hook scripts live in the package root, not in `dist/`.

**Something is off — start here:** run `npx skill-codex doctor`. It checks the running build, the Codex CLI version, a live Codex call, the models your plan offers against your configured default, the Windows sandbox mode, how skill-codex is installed (missing, disabled for this project, or installed twice), and whether a newer skill-codex exists. Use `--offline` to skip the live call and the npm lookup.

**`/codex-review` says "Unknown tool: codex_exec"** — restart Claude Code after setup. The MCP server only loads on startup. `npx skill-codex doctor` shows whether the server is registered or disabled for the project.

**Codex keeps timing out** — increase it: `export SKILL_CODEX_TIMEOUT_MS=1200000` (20 min). Large codebases take longer.

**"Auth expired" but Codex works in another terminal** — the MCP server runs in its own process. Run `codex login` and restart Claude Code. On Windows the auth pre-check is skipped automatically (PowerShell profile errors cause false negatives); auth is still verified when Codex actually runs.

**Lock file blocking runs** — a crashed run can leave a stale `.skill-codex.lock`. It auto-cleans after 15 minutes, or delete it manually.

**Windows: which Codex sandbox does skill-codex use?** — the mode from `SKILL_CODEX_WINDOWS_SANDBOX`, else `[windows] sandbox` in your `~/.codex/config.toml`, else `unelevated`. Use `elevated`: on codex-cli 0.163 it is the only backend where Codex can both run git and start child processes (npm, vitest, builds). It runs commands as a separate account, so skill-codex trusts the workspace repo for git through `GIT_CONFIG_*` environment variables (your git config is not changed). Under `unelevated`, Codex can't run builds or tests: child processes fail with `EPERM` ([#26](https://github.com/Arystos/skill-codex/issues/26)). Details: [docs/CONFIGURATION.md](docs/CONFIGURATION.md#windows-sandbox-mode).

## Security scanning (SkillSpector)

**Verdict:** NVIDIA SkillSpector v2.3.13 currently reports **100/100, CRITICAL, DO NOT INSTALL** for this repo even though there are **zero CRITICAL findings**. That verdict is expected here: the score is saturated by the remaining HIGH findings, so fixing the resolved dependency issue did not move the verdict. Do not read the score as proof that a critical vulnerability remains, and do not read the baseline as a clean bill of health.

```shell
skillspector scan . --no-llm
skillspector scan . --baseline .skillspector-baseline.yaml --no-llm
skillspector scan . --baseline .skillspector-baseline.yaml --no-llm --show-suppressed
```

**LLM mode:** `--no-llm` matters. Without it, SkillSpector attempts LLM analysis and needs provider credentials such as `NVIDIA_INFERENCE_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`.

| Scan | Findings | Suppressed | Verdict |
| --- | ---: | ---: | --- |
| Fresh clone, raw | 53 | 0 | 100/100, CRITICAL, DO NOT INSTALL |
| Fresh clone, with baseline | 50 | 3 | 100/100, CRITICAL, DO NOT INSTALL |
| Built working copy, raw | 72 | 0 | 100/100, CRITICAL, DO NOT INSTALL |
| Built working copy, with baseline | 50 | 22 | 100/100, CRITICAL, DO NOT INSTALL |

**Baseline:** Baselined scans converge on 50 findings regardless of build state. `dist/` and `coverage/` are gitignored, so they exist only in a locally built copy and duplicate source findings. The baseline suppresses only `dist/**`, `coverage/**`, and `eval/corpus/**` - never `src/`, `setup/`, or `bin/`. Product code stays visible on purpose so the scan remains auditable rather than laundered; run `--show-suppressed` to verify the suppressed paths and written reasons rather than trusting this summary.

**Remaining findings:** The severity mix is **14 HIGH, 26 MEDIUM, 10 LOW**. All 14 HIGH findings are verified false positives:

| Rule | Location | Why it is not a product vulnerability |
| --- | --- | --- |
| AS1 | `setup/setup.ts:110,137` | Reads `~/.claude/settings.json`; that is the product's installer configuring the PostToolUse hook. |
| RA1 | `bin/skill-codex.ts:29,84`; `src/errors/errors.ts:126` | Matches `--help` usage text and an error-message string. |
| TM1/TM2 | `__tests__/runner/progress.test.ts:30,32`; `__tests__/tools/codex-exec.test.ts:291` | Test fixtures contain `rm -rf /` and `model: "x;rm -rf"` to prove the runner reports blocked commands and rejects invalid input. |
| TM1 | `package-lock.json` | Matches a lockfile string. |
| AS1/TM1/TM2 | `README.md` (this section) | Self-referential: documenting the fixtures above means quoting them, so this very section trips the same string detectors. Four HIGH findings exist only because the docs explain the false positives. |

Also present at MEDIUM: `TM3` on `src/guards/preflight.ts:12,33`, matching the parameter names `skipAuth` and `skipLock`. Both are optional and default falsy, so the checks run by default.

**Dependency status:** `SC4` is fixed and gone: there are now zero SC4 findings and zero CRITICAL findings. The dependency work was `@modelcontextprotocol/sdk` `^1.26.0` -> `^1.29.0`, `vitest` `^2.0.0` -> `^3.2.7`, `@vitest/coverage-v8` `^2.0.0` -> `^3.2.7`, and `tsup` `^8.0.0` -> `^8.5.1`. `npm audit` went from 15 vulnerabilities, including 2 critical, to 1 low. The remaining low is `esbuild` pinned transitively by `tsup`; it is build tooling, is never shipped, and is unreachable here because nothing runs an esbuild dev server.

**SC4 nuance:** SkillSpector reads the declared semver range floor in `package.json`, not the resolved version in `package-lock.json`. It reported `vitest==3.2.4` from `^3.2.4`, so the declared floors were raised to versions that are themselves non-vulnerable - OSV reports CVE-2026-47429 affects `vitest <3.2.6`, and CVE-2024-53384 affects `tsup <=8.3.4` - rather than relying on the lockfile alone.

*(Counts are a SkillSpector v2.3.13 snapshot and will shift as the scanner and dependencies change. Re-run the commands above rather than trusting these numbers.)*

## Development

```shell
git clone https://github.com/Arystos/skill-codex.git
cd skill-codex
npm install
npm run build
npm test
npm run test:coverage   # enforces the same 80%+ gate as CI
```

After changing `src/`, run `npm run build`, then in Claude Code `/mcp` → skill-codex → **Reconnect** to load the new build without restarting the session.

A weekly workflow (`codex-drift`) installs the latest Codex CLI and checks every flag and JSONL event type skill-codex relies on (`src/config/codex-contract.ts`). It opens a `codex-cli-drift` issue when the contract breaks or when a new Codex minor version needs re-verification. When a Codex version newer than the verified one runs, skill-codex also adds a one-time note to its first response.

Security policy: [SECURITY.md](SECURITY.md). Uninstall: `npx skill-codex uninstall`.

## Inspired By

* [Dunqing/claude-codex-bridge](https://github.com/Dunqing/claude-codex-bridge) — retry logic, anti-recursion, output parsing
* [EpocheDrift/claude-codex-skill](https://github.com/EpocheDrift/claude-codex-skill) — subscription-first, delegation heuristics
* [incadawr/claude-codex-skill](https://github.com/incadawr/claude-codex-skill) — MCP server approach, auto-triggers

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md), the [roadmap](ROADMAP.md), and the [project board](https://github.com/users/Arystos/projects/2) — issues tagged **good first issue** and **help wanted** are a great place to start. Questions and ideas go in [Discussions](https://github.com/Arystos/skill-codex/discussions). If you find this useful, you can [support the project on Ko-fi](https://ko-fi.com/arystos).

## License

[MIT](LICENSE)
