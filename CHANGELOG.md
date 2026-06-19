# Changelog

All notable changes to this project will be documented in this file.

## [0.8.0] - 2026-06-19

### Added
- **Installable as a Claude Code plugin.** Added `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, a root `.mcp.json`, and `.claude-plugin/hooks/hooks.json` so the repo can be installed via `/plugin marketplace add Arystos/skill-codex` then `/plugin install skill-codex@skill-codex` — alongside the existing `npx skill-codex setup`.
- **`skill-codex mcp` subcommand** that starts the MCP server over stdio. The plugin's `.mcp.json` launches the server with `npx -y skill-codex mcp`, so no built artifacts need to be committed.
- Cross-platform Node PostToolUse hook (`hooks/post-tool-use-review.mjs`) used by the plugin install path.

## [0.7.1] - 2026-06-19

### Fixed
- **Native review (`review: true`) was broken.** The runner always appended the `-` stdin sentinel, but `codex exec review` rejects a `[PROMPT]` alongside a scope flag (`--uncommitted` / `--base` / `--commit`) — so every native review failed with *"the argument '--uncommitted' cannot be used with '[PROMPT]'"*. The prompt is now sent only for prompt-only reviews (custom instructions, no scope flag); scope-flag reviews omit `-`. Added a guard that rejects combining a review target with a prompt (the CLI forbids it).

## [0.7.0] - 2026-06-19

### Added
- **Model selection** — optional `model` param on `codex_exec` (e.g. `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`), mapped to `codex exec -m`. Omit for the configured default.
- **Reasoning effort** — optional `reasoningEffort` param (`minimal` | `low` | `medium` | `high` | `xhigh`), mapped to `-c model_reasoning_effort=...`.
- **Native review** — optional `review` flag runs Codex's diff-scoped `codex exec review` (with `reviewBase` / `reviewCommit` targeting). `/codex-review` documents it as an option alongside the default Claude-led review.
- The response header now shows the model, `effort:<x>`, and a `review`/`resumed` label when those are set.

### Security
- Validate `model`, `reviewBase`, and `reviewCommit` (as with `sessionId`) so externally-supplied values can't inject extra shell args on the Windows `shell:true` path.

### Notes
- `prompt` is now optional only when `review` is set; all other calls still require it. Verified against codex-cli 0.133.0.

## [0.6.0] - 2026-06-19

### Added
- **Explicit sandbox control** on `codex_exec`: a `sandbox` param (`read-only` | `workspace-write` | `danger-full-access`) that overrides the `mode` default and maps to `codex exec --sandbox`.
- **Session memory**: a `sessionId` param resumes a prior Codex session via `codex exec resume <thread_id>`, so Codex retains context across calls. The thread id is captured from the `thread.started` event and surfaced in the response.
- **Structured review verdict** (APPROVED / WARNING / BLOCKED) plus a bounded (≤3 round) fix → re-review loop in `/codex-review` and the `codex-bridge` agent skill, with Claude as the final judge.
- `DISTRIBUTION.md` — a prioritized, evidence-backed distribution checklist.

### Changed
- **Live log** now defaults to a per-workspace file under the OS temp dir instead of `<cwd>/.skill-codex.log`, so a run no longer drops a growing untracked file into your working repo. `SKILL_CODEX_LOG` still overrides.
- Review/delegate flows now run `git status --short` so they see newly-created files that `git diff` alone misses.
- **Fail soft:** if Codex is unavailable (not installed, auth expired, offline), the review degrades to Claude-only instead of blocking the user.
- CI now enforces the 80% coverage gate; the README leads with cross-model positioning and an honest comparison table.

### Notes
- Verified against `codex-cli` 0.133.0.

## [0.5.0] - 2026-06-15

### Added
- **Live progress streaming:** the `codex_exec` tool now emits MCP `notifications/progress` as Codex works — `thinking…`, `running: <cmd>`, `ran:`/`blocked:`/`failed:`, file edits, `writing response…`, and a `Codex working… Ns elapsed` heartbeat every 10s. A long Codex run no longer looks frozen in the Claude UI. (Progress is sent only when the client supplies a `progressToken`.)
- **Recovered live file log** (`.skill-codex.log`): a tail-able, human-readable per-run log of Codex's JSONL activity, written incrementally so a buffered run can be watched in real time. Path overridable via `SKILL_CODEX_LOG`. *(This feature previously existed only in a compiled build and was never committed to source; it is now restored and tested.)*
- Final response header now includes the run's elapsed wall-clock time.

### Changed
- **Default timeout lowered from 10 min to 5 min** (`SKILL_CODEX_TIMEOUT_MS`, still per-call overridable via `timeoutMs`). With live progress, a genuinely stuck run is now distinguishable from a slow one.
- Server now reports its actual package version over MCP (was pinned to `0.2.0`).

## [0.4.1] - 2026-05-25

### Fixed
- **Windows sandbox spawn failure:** on Windows, Codex's default *elevated* sandbox fails to spawn shell processes with `windows sandbox failed: spawn setup refresh` ([openai/codex#24098](https://github.com/openai/codex/issues/24098), [#24259](https://github.com/openai/codex/issues/24259)), which blocked every command — including read-only review and consult runs. The runner now pins `windows.sandbox=unelevated` on Windows, which spawns reliably. Override via the new `SKILL_CODEX_WINDOWS_SANDBOX` env var (`unelevated` default, set `elevated` to opt back in).

## [0.4.0] - 2026-05-25

### Added
- **`codex-bridge` agent skill** (`skills/codex-bridge/SKILL.md`): auto-triggers on implementation, review, and consult requests so Claude reaches for Codex without an explicit slash command. Installed to `~/.claude/skills/` by setup and removed by uninstall.
- Setup/verify now install and check the agent skill; `skills/` added to the published npm package.
- Output parser captures `reasoning_output_tokens` from `turn.completed` usage and surfaces it in the response header.
- Output parser handles the current `file_change` item type (top-level `path` or a `changes[]` array), restoring file-activity tracking.

### Fixed
- **Codex CLI compatibility:** replaced the deprecated `--full-auto` flag with `--sandbox workspace-write` (Codex ~v0.131 made `--full-auto` a hidden alias that prints a deprecation warning). `mode: "full-auto"` on the `codex_exec` tool is unchanged.
- Output parser ignores `agent_message` text on `item.started`/`item.updated` partials, preventing double-counted/garbled output when Codex streams.

## [0.3.0] - 2026-04

### Added
- Parse activity events (`command_execution`, `file_read`, `file_write`) and token usage from the Codex JSON stream.
- Rich plain-text response: metadata header (mode, cwd, token usage), activity log, and content.

### Changed
- `spawn`/`execFile` use `shell: true` on Windows for npm `.cmd` shim support.
- Auth pre-check skipped on Windows (PowerShell profile errors cause false negatives); auth still verified when Codex runs.
- Auth check timeout raised from 15s to 30s.

## [0.2.0] - 2026-03-27

### Changed
- **Renamed** from `codex-bridge` to `skill-codex` across all surfaces (npm, MCP, env vars, docs)
- Environment variables renamed: `CODEX_BRIDGE_*` -> `SKILL_CODEX_*`
- Lock file renamed: `.codex-bridge.lock` -> `.skill-codex.lock`
- CLI binary renamed: `codex-bridge` -> `skill-codex`

### Fixed
- Windows timeout: use immediate kill instead of unsupported SIGTERM/SIGKILL sequence
- Binary resolution now memoized (was scanned twice per call)
- Auth check cached for 60 seconds (was spawning subprocess every call)
- Output parser accumulates all agent messages instead of keeping only last
- Auth check uses resolved binary path instead of bare `"codex"` name
- `CLAUDE.md` corrected: documents `shell: false`, not `shell: true`
- Retry log now includes error type name (e.g. `RateLimitError`) instead of generic "Transient error"
- tsup shebang only added to CLI binary, not library entry point
- stdout buffering uses chunk array instead of string concatenation

### Added
- `--help`/`-h` and `--version`/`-v` CLI flags
- Automated `uninstall` command (removes MCP server, slash commands, and hook)
- CI pipeline: GitHub Actions matrix (Node 18/20/22 x ubuntu/macos/windows)
- npm publish pipeline: triggered by version tags
- Coverage thresholds enforced at 80%
- Tests for: exec-runner, timeout, check-binary, check-auth, check-lock, lock-file, preflight, codex-exec handler, check-git, platform utils, config paths
- `CHANGELOG.md`
- `exports` field in package.json
- `homepage`, `bugs`, `funding` fields in package.json
- Dynamic npm version badge in README

### Removed
- Dead code: unused `getShell()` function

## [0.1.0] - 2026-03-24

### Added
- Initial release as `codex-bridge`
- MCP server with `codex_exec` tool
- Slash commands: `/codex-review`, `/codex-do`, `/codex-consult`
- PostToolUse auto-review hook with smart diff filtering
- One-command setup: `npx codex-bridge setup`
- Pre-flight checks: recursion, binary, auth, lock, git
- Retry with exponential backoff and jitter
- Cross-platform support (Windows, macOS, Linux)
