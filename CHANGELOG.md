# Changelog

All notable changes to this project will be documented in this file.

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
