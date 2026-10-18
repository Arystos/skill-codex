# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.10.0] - 2026-10-19

### Added
- **Real-Codex end-to-end tests** (#23). `npm run test:e2e` builds, starts `dist/index.js` as an MCP server and calls `codex_exec` over stdio with the developer's own `codex login`: a read-only prompt with its session id, a resume, `outputSchema`, `addDirs` under `workspace-write`, a native review of an uncommitted change, and the rejected-model fallback. It is not part of `npm test` or CI: fork PRs get no secrets, and a stored ChatGPT login token would be exposed to every dependency installed in CI.
- **`addDirs` on `codex_exec`** (#21). Extra writable roots besides `cwd`, passed as one `codex exec --add-dir` per entry, for monorepo tasks that span packages. Off by default. Entries resolve against `cwd`, must exist, and must use shell-safe characters (`INVALID_ADD_DIR` otherwise). `addDirs` needs a writable sandbox, because Codex silently ignores `--add-dir` under `read-only`. It is rejected with `review` and `sessionId`, which have no `--add-dir`. The response header lists the added roots. On Windows, path arguments to the codex spawn are now quoted for cmd.exe.
- **`outputSchema` on `codex_exec`** (#20). Pass an inline JSON Schema and Codex constrains its final message to it (`codex exec --output-schema`), e.g. review findings as `{severity, file, line, fix}`. skill-codex writes the schema to a private temp file and deletes it when the call ends. The response shows the final message as a JSON block. Works with `sessionId`; rejected with `review`. Codex uses OpenAI strict mode, so a non-strict schema fails with `INVALID_REQUEST`. On Windows, path arguments to the codex spawn are now quoted for cmd.exe, and paths with cmd.exe metacharacters (`%`, `"`, `&`, ...) are refused.

### Changed
- **The `codex-bridge` skill tells Claude when to call Codex on its own.** Claude now asks Codex for an independent review before it calls a non-trivial change done (roughly 50+ changed lines, or auth, security, payments, crypto, concurrency or migrations), and consults Codex when a bug survives two fix attempts (was three). It announces every call. Delegation triggers on explicit requests only and needs an allowed file list and a verification command; a bare "implement X" no longer delegates. To opt out of autonomous calls, set `disable-model-invocation: true` in the installed skill.

### Fixed
- **A finished run without a final message is no longer retried** (#59). When Codex completed the turn or took actions but ended with an empty `agent_message`, skill-codex raised the retryable `EMPTY_OUTPUT` error, and the retry ran the whole task again: a write task wrote its files twice. The run now succeeds with the note "Codex completed the turn without a final message" and lists the actions. `EMPTY_OUTPUT` is left for streams where nothing ran. The plain-text fallback now uses only non-JSON lines, so a stream of events with no message no longer shows raw JSONL as the answer.

## [0.9.0] - 2026-10-18

### Changed
- **Requires Node.js 20 or newer** (was 18). Node 18 reached end of life in April 2025, and vitest 4 (needed for a security fix) does not run on it. CI now tests Node 20, 22 and 24.
- **Model examples updated.** `gpt-5.5` was retired for ChatGPT-auth users on 2026-10-14. Docs, command help, and the `model` tool description now use `gpt-6.1-sol` and `gpt-6-luna` (slugs from the Codex 0.163.0 bundled catalog) and point to `codex debug models`, since availability depends on the ChatGPT plan.
- Verified against codex-cli 0.163.0.
- **Windows sandbox follows your Codex config, and git works under `elevated`.** skill-codex no longer forces `unelevated`. The mode comes from `SKILL_CODEX_WINDOWS_SANDBOX`, else `[windows] sandbox` in `~/.codex/config.toml`, else `unelevated`. Under `unelevated`, Codex cannot start child processes (`EPERM`), so it can't run builds or tests (#26). Under `elevated`, commands run as a separate account and git rejected the repo ("detected dubious ownership"); skill-codex now trusts the workspace repo for the Codex process via `GIT_CONFIG_*` environment variables. Re-tested on codex-cli 0.163.0: under `elevated`, Codex runs git, npm and vitest. The `elevated` spawn failure (openai/codex#24098) is fixed upstream. `skill-codex doctor` warns when the mode is `unelevated`.
- **`SKILL_CODEX_WINDOWS_SANDBOX` now accepts exactly `elevated`, `unelevated` or `mxc`** (trimmed, case-insensitive). Any other value is ignored with a stderr warning instead of being forwarded to Codex.
- **Errors come from Codex's `turn.failed` event.** The HTTP status classifies the failure (401/403 auth, 429 rate limit, 5xx server, other 4xx invalid request); stderr keyword matching is now only the fallback. JSON-encoded API errors are unwrapped to their human message. Transient reconnect `error` events are no longer treated as fatal.
- Auth and rate-limit errors now include Codex's own message.
- **Progress notifications** for `web_search` (query), `mcp_tool_call` (server/tool) and `todo_list` (plan step) items.
- **Claude routes the model per task.** The `model` description now lists the models on the user's account, read live from `codex debug models` at tools/list time. Commands and the agent skill tell Claude to pick from that list when `--model` is absent: the strongest model for reviews and multi-file work, a fast one for quick questions. An explicit `--model` still wins.
- **Heartbeat shows the plan step.** Long runs report `Codex working… 2m 10s · plan 2/5: <step>` (or the last action) instead of a bare timer. Claude Code shows this line in `/tasks` once it backgrounds a long call.
- **Response size fits Claude Code's MCP limits.** The inline answer is capped at 36,000 characters (was 80,000), under Claude Code's 50,000-character file threshold and 10,000-token warning. Longer answers are saved in full to a file named in the response. Only the 40 most recent actions are listed.
- The MCP server reports its version from `package.json` (it was hard-coded) and logs which build it runs at startup.
- `skill-codex setup` refuses to run when the plugin is already installed, unless `--force` is given, so the server, commands and hook are not registered twice.
- **`/codex-review` focuses on correctness, security and requirements.** Codex is told not to report style or readability and not to suggest defensive checks for unreachable states; Claude's audit drops those too. A reviewer asked to find gaps always finds some, and chasing them all leads to over-engineering.
- **`/codex-review` works without git.** In a project without git (e.g. Diversion), it reviews an explicit list of files instead of failing on `requireGit`, and says that the out-of-scope check is skipped without a diff.
- **`/codex-do` guards against drift.** Every delegation states the exact files Codex may touch and a verification command that defines "done". Afterwards Claude reports any file changed outside the list as drift (never accepted silently), runs the verification command itself and shows the output. Delegation now requires git, which it needs to detect every changed file.

### Added
- **`INVALID_REQUEST` error code** (non-retryable) — e.g. a model the ChatGPT plan does not support now reports the model problem instead of raw JSON.
- **Model fallback.** If Codex rejects the chosen model for this account, the call retries once with the configured default and notes it in the response.
- **`skill-codex doctor`** — checks the running build (and a stale `dist/`), Node, the Codex CLI version against the verified one, a live Codex call, the account's models against the configured default, the Windows sandbox mode, the install state (missing, disabled for the project, or installed twice) and npm for a newer skill-codex. `--offline` skips the live checks; `--json` prints machine-readable results.
- **CLI subcommand registry** (`src/cli/registry.ts`). Subcommands are `CliCommand` objects; `bin/skill-codex.ts` only wires them.
- **Codex contract** (`src/config/codex-contract.ts`): the flags, event types and verified Codex version skill-codex relies on.
- **Weekly `codex-drift` workflow.** It installs the latest Codex CLI, checks the contract against `--help` and the upstream `exec_events.rs`, and opens a `codex-cli-drift` issue on breaking drift or on a new Codex minor version.
- **`/codex-review --spec <path>`** — Codex checks that every requirement in the spec is implemented, every listed edge case has a test, and nothing outside the spec's scope changed. Claude adds a requirements checklist to the result.
- **One-time version note.** When the installed Codex is a minor version newer or older than the verified one, the first response of a session says so.
- **Audit pass in `/codex-review`.** Before the verdict, Claude checks every Codex finding against the code and labels it keep / rewrite / drop (with a typed reason) / new. Only findings backed by quoted code survive, and dropped ones are listed under "Filtered".
- **`--effort` and `--model` flags** on `/codex-review`, `/codex-do` and `/codex-consult`.
- **Cache-write tokens in the header.** codex-cli 0.163.0 reports `cache_write_input_tokens`; the `codex_exec` header shows `(N cache write)` when N > 0.
- **Cross-model review eval harness** (`npm run eval`): 12 seeded one-bug diffs scored for catch rate and false positives. The mock reviewer is the default and costs nothing; the live reviewer is opt-in and never receives the answer key.
- **Model routing recipe** in `docs/CONFIGURATION.md` (contributed by @praveenkumarr18).

### Removed
- Parser, progress and live-log handling for `file_read` / `file_write` / `file_edit` items and top-level `result` / `message` events. No version of Codex's `exec --json` schema has emitted them.

### Fixed
- A failed command with `exit_code: null` showed "exit null"; it now shows `failed`.
- `skill-codex --version` printed `0.0.0` from the built bin (it looked for `package.json` inside `dist/`).

### Security
- **PR safety checks** on every pull request: dependency review (fails on new dependencies with moderate or worse vulnerabilities) and a hidden-Unicode scan of changed files (bidi controls, invisible tag characters, zero-width spaces, NUL bytes in text files). The workflow runs from the base branch (`pull_request_target`) and reads the PR's files as git objects, so a PR can neither weaken the checks nor run code in them; symlinks and submodules are skipped.
- **Dependabot** weekly updates for npm dependencies and the SHA-pinned GitHub Actions.
- **Pull request template** and a documented review rule for outside contributions (`CLAUDE.md`, `SECURITY.md`).
- **npm trusted publishing (OIDC) with provenance, staged.** The long-lived `NPM_TOKEN` is gone; the publish workflow can only stage a release, which a maintainer approves on npmjs.com with 2FA.
- **Release job without the npm dependency cache**, so a poisoned cache entry cannot reach the published package. GitHub Actions updated to `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0.
- **Dependency security updates.** `@modelcontextprotocol/sdk` ^1.31.0 (fixes an OAuth client credential leak) with its patched transitive dependencies (`proxy-addr`, `hono`, `ip-address`, `fast-uri`, `source-map-js`, `brace-expansion`), and `vitest`/`@vitest/coverage-v8` ^4.1.11 (drops the vulnerable `tinypool`). `npm audit`: 17 findings (3 critical, 6 high) → 1 low (dev-only esbuild via tsup).
- Raised dependency floors (`@modelcontextprotocol/sdk` ^1.29.0, `vitest` ^3.2.7, `tsup` ^8.5.1) so a fresh install cannot resolve a vulnerable version, and added a SkillSpector baseline that only suppresses generated files and the deliberately vulnerable eval corpus.

## [0.8.1] - 2026-06-20

### Added
- **`SECURITY.md`** — private vulnerability-disclosure policy and security posture.
- **Codex plugin manifest** (`.codex-plugin/plugin.json` + `assets/icon.svg`) so skill-codex is installable as an OpenAI Codex plugin too, not just a Claude Code plugin.
- Ship `.codex-plugin`, `assets/`, and `SECURITY.md` in the npm package.

### Changed
- **Hardening:** GitHub Actions are now SHA-pinned (checkout v4.2.2, setup-node v4.1.0) in CI and publish workflows.
- **Docs:** README restructured per the standard-readme spec (single hero demo, collapsible TOC + demo gallery, Install/Usage grouping); full configuration, smart-filter, and edge-case reference moved to `docs/CONFIGURATION.md`.

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
