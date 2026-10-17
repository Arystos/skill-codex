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
| `SKILL_CODEX_WINDOWS_SANDBOX` | `unelevated` | Windows only — Codex `windows.sandbox` mode: `unelevated`, `elevated` or `mxc`. Other values are ignored with a stderr warning. See [Windows sandbox mode](#windows-sandbox-mode) |

### Windows sandbox mode

On Windows, skill-codex passes `-c windows.sandbox=<mode>` on every Codex
call. This overrides `[windows] sandbox` in `~/.codex/config.toml`. The
default is `unelevated`. Results on codex-cli 0.163.0 (Windows 11, ChatGPT
auth):

| Mode | Shell spawns | `git status` in your repo | Write inside workspace | Write outside workspace |
|------|--------------|---------------------------|------------------------|-------------------------|
| `unelevated` (default) | ✅ | ✅ | ✅ | blocked |
| `elevated` | ✅ | ❌ *detected dubious ownership* | ✅ | blocked |
| `mxc` | ✅ | ❌ *this operation must be run in a work tree* | ✅ | blocked |

- `elevated` runs commands as a separate local account (`CodexSandboxOffline`).
  Git refuses repos owned by another user. To use `elevated`, add your repos
  to git's `safe.directory`.
- The older `windows sandbox failed: spawn setup refresh` error with
  `elevated` ([openai/codex#24098](https://github.com/openai/codex/issues/24098),
  [#24259](https://github.com/openai/codex/issues/24259)) is fixed in 0.163.
  It was the original reason for the pin.
- `workspace-write` also allows writes under `%TEMP%`, in every mode. That is
  Codex's default writable-roots policy, not a sandbox escape.
- If Codex resolves its `prefer_mxc` setting, it uses MXC whatever mode is set.

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
| Model not on the account | Retries once with the configured default and notes it in the response |
| Very long Codex answer | Inlines the first 36,000 characters (Claude Code saves MCP results over 50,000 characters to a file and warns above 10,000 tokens) and saves the full text to a file named in the response |
| Busy run with many commands | Shows the 40 most recent actions; the live log has all of them |
| Codex newer than verified | One-time note in the first response; `npx skill-codex doctor` shows details |

## `codex_exec` tool parameters

The MCP server exposes one tool, `codex_exec`. All parameters except `prompt`
are optional; omit them and Codex uses its configured defaults.

| Param | Type | Description |
|-------|------|-------------|
| `prompt` | string | The task / question for Codex (optional only when `review` is set) |
| `mode` | `exec` \| `full-auto` | `exec` = read-only (default), `full-auto` = can write files |
| `sandbox` | `read-only` \| `workspace-write` \| `danger-full-access` | Explicit sandbox policy; overrides `mode` |
| `sessionId` | string | Resume a prior Codex session (thread id from a previous response) |
| `model` | string | Codex model. At tools/list time the description lists the models on this account (`codex debug models`). Omit it for your configured default. A model Codex rejects falls back to the default once, with a note in the response |
| `reasoningEffort` | `minimal` \| `low` \| `medium` \| `high` \| `xhigh` | How hard Codex thinks |
| `review` | boolean | Run Codex's native diff-scoped `codex exec review` |
| `reviewBase` | string | With `review`: diff against this base branch |
| `reviewCommit` | string | With `review`: review the changes in this commit SHA |
| `cwd` | string | Working directory (defaults to server cwd) |
| `timeoutMs` | number | Override the default timeout |
| `requireGit` | boolean | Fail if not inside a git repository |
