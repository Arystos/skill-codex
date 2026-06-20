# Configuration & reference

Full configuration, auto-review filter rules, and edge-case behavior for
[skill-codex](../README.md). The README keeps a short summary; this is the
complete reference.

## Environment variables

All optional.

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_CODEX_TIMEOUT_MS` | `300000` (5 min) | Subprocess timeout |
| `SKILL_CODEX_MAX_RETRIES` | `3` | Retry count for transient errors |
| `SKILL_CODEX_LOG` | `<os-temp>/skill-codex/<workspace>.log` | Absolute path override for the live, tail-able per-run log |
| `SKILL_CODEX_DEBUG` | — | Enable debug logging to stderr |
| `SKILL_CODEX_WINDOWS_SANDBOX` | `unelevated` | Windows only — Codex `windows.sandbox` mode (`unelevated`/`elevated`) |

## Smart-filter thresholds (auto-review hook)

The PostToolUse hook decides whether to suggest `/codex-review` after an edit:

| Condition | Action | Rationale |
|-----------|--------|-----------|
| < 5 lines changed | Skip | Not worth the Codex call |
| All files are `.md`/`.txt`/`.rst` | Skip | Documentation-only |
| Whitespace or import-only diff | Skip | Formatting change |
| Path contains `auth`/`security`/`crypto` | **Force review** | Security-sensitive |
| > 100 lines changed | **Force review** | High-impact change |
| > 3 files changed | **Force review** | Cross-cutting change |

## Edge cases handled

| Scenario | What happens |
|----------|-------------|
| Codex not installed | Clear error with install instructions |
| Auth expired | Advises `codex login`, no retry |
| Network down | Retries 3× with exponential backoff |
| Rate limited (429) | Retries with backoff + jitter |
| Codex hangs | Killed after timeout (SIGTERM+SIGKILL on Unix, immediate kill on Windows) |
| Concurrent runs | Lock file prevents conflicts (stale after 15 min) |
| Recursive calls | `SKILL_CODEX_DEPTH` limit prevents infinite loops |
| Trivial changes | Smart filter skips auto-review |
| Empty Codex output | Retries once, then reports clearly |

## `codex_exec` tool parameters

The MCP server exposes one tool, `codex_exec`. All parameters except `prompt`
are optional; omit them and Codex uses its configured defaults.

| Param | Type | Description |
|-------|------|-------------|
| `prompt` | string | The task / question for Codex (optional only when `review` is set) |
| `mode` | `exec` \| `full-auto` | `exec` = read-only (default), `full-auto` = can write files |
| `sandbox` | `read-only` \| `workspace-write` \| `danger-full-access` | Explicit sandbox policy; overrides `mode` |
| `sessionId` | string | Resume a prior Codex session (thread id from a previous response) |
| `model` | string | Codex model, e.g. `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` |
| `reasoningEffort` | `minimal` \| `low` \| `medium` \| `high` \| `xhigh` | How hard Codex thinks |
| `review` | boolean | Run Codex's native diff-scoped `codex exec review` |
| `reviewBase` | string | With `review`: diff against this base branch |
| `reviewCommit` | string | With `review`: review the changes in this commit SHA |
| `cwd` | string | Working directory (defaults to server cwd) |
| `timeoutMs` | number | Override the default timeout |
| `requireGit` | boolean | Fail if not inside a git repository |
