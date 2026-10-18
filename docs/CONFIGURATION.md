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
| `SKILL_CODEX_WINDOWS_SANDBOX` | `[windows] sandbox` from `~/.codex/config.toml`, else `unelevated` | Windows only — Codex `windows.sandbox` mode: `elevated`, `unelevated` or `mxc`. Other values are ignored with a stderr warning. See [Windows sandbox mode](#windows-sandbox-mode) |

### Windows sandbox mode

On Windows, skill-codex passes `-c windows.sandbox=<mode>` on every Codex
call. The mode comes from `SKILL_CODEX_WINDOWS_SANDBOX`, else from
`[windows] sandbox` in `~/.codex/config.toml`, else `unelevated`. Results on
codex-cli 0.163.0 (Windows 11, ChatGPT auth):

| Mode | Codex runs git | Child processes (npm, vitest, builds) | Write inside workspace | Write outside workspace |
|------|----------------|---------------------------------------|------------------------|-------------------------|
| `elevated` (recommended) | ✅ via `safe.directory` (set by skill-codex) | ✅ | ✅ | blocked |
| `unelevated` (fallback) | ✅ directly; ❌ from scripts | ❌ *EPERM* | ✅ | blocked |
| `mxc` | ❌ *this operation must be run in a work tree* | not tested | ✅ | blocked |

- `elevated` runs commands as a separate local account (`CodexSandboxOffline`),
  so git would refuse your repo with *detected dubious ownership*. skill-codex
  trusts the workspace repo, and only that repo, for the Codex process through
  git's `GIT_CONFIG_*` environment variables. Your git config is not changed.
- `unelevated` needs no one-time setup, which is why it is the fallback. But
  any process that starts a child process fails with `EPERM`, so Codex cannot
  run builds or tests ([#26](https://github.com/Arystos/skill-codex/issues/26)).
  `npx skill-codex doctor` warns about this.
- To use `elevated`, set `[windows] sandbox = "elevated"` in
  `~/.codex/config.toml`. Codex may ask for a one-time elevated setup.
- The older `windows sandbox failed: spawn setup refresh` error with
  `elevated` ([openai/codex#24098](https://github.com/openai/codex/issues/24098),
  [#24259](https://github.com/openai/codex/issues/24259)) is fixed in 0.163.
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
| `addDirs` | string[] | Extra writable roots besides `cwd` (`--add-dir`), at most 16. See [Extra writable roots](#extra-writable-roots-adddirs) |
| `cwd` | string | Working directory (defaults to server cwd) |
| `timeoutMs` | number | Override the default timeout |
| `requireGit` | boolean | Fail if not inside a git repository |

### Extra writable roots (`addDirs`)

`addDirs` passes one `codex exec --add-dir <DIR>` per entry. Codex can then
write in those directories as well as in `cwd`. Use it when one task spans
packages outside `cwd`, for example `cwd: "packages/app"` with
`addDirs: ["../shared"]`.

**Safety.** Every entry widens what Codex can modify on your machine. The
default is no extra roots. Pass only the directories the task needs, and
never a home directory or a drive root. The response header lists the roots
that were added, as `add-dir (writable): ...`.

skill-codex validates each entry before it starts Codex:

| Check | Result when it fails |
|-------|----------------------|
| A relative entry resolves against `cwd` | (always applied) |
| The directory exists | `INVALID_ADD_DIR` |
| The path has only letters, digits, space and `. _ - : \ / ( ) + @ , ~ ' # [ ] { } =` | `INVALID_ADD_DIR` (on Windows, codex starts through cmd.exe, so characters such as `%`, `&`, `"` are refused) |
| The sandbox is writable: `mode: "full-auto"`, or `sandbox: "workspace-write"` or `"danger-full-access"` | `INVALID_OPTIONS` (under `read-only`, Codex silently ignores `--add-dir`) |
| Not combined with `review` or `sessionId` | `INVALID_OPTIONS` (`codex exec review` and `codex exec resume` have no `--add-dir`; a resumed session keeps its original writable roots) |

Duplicate entries are dropped. Under `danger-full-access`, Codex can already
write anywhere, so `addDirs` changes nothing there.


## Model routing recipes

Claude picks the Codex model for each call from the models your account offers. The `codex_exec` tool description lists them; run `codex debug models` to see the same list. Use these recipes when you want to choose yourself, with the command flags `--model` and `--effort`:

| Workflow | Model | Reasoning effort | Use for |
|----------|-------|------------------|---------|
| `/codex-do` | a fast model, e.g. `gpt-6-luna` | default | Mechanical or bulk work |
| `/codex-review` | the strongest model on your plan, e.g. `gpt-6.1-sol` | `high` | Careful review and higher-rigor checks |

Model availability depends on your ChatGPT plan and changes between Codex releases. If your plan does not offer `gpt-6.1-sol`, use the strongest model that `codex debug models` lists (for example `gpt-5.6-terra`). A model Codex rejects falls back to your configured default, with a note in the response.

```shell
/codex-do --model gpt-6-luna "convert the fixtures in test/data to JSON"
/codex-review --model gpt-6.1-sol --effort high
```

The same choices as `codex_exec` parameters:

```json
{
  "model": "gpt-6-luna"
}
```

For a careful review:

```json
{
  "model": "gpt-6.1-sol",
  "reasoningEffort": "high"
}
```

Use the lighter model for straightforward, repetitive work, and keep the stronger model with higher reasoning effort for work that benefits from a more careful pass.
