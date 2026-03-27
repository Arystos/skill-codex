# skill-codex

Cross-platform Claude Code skill integrating OpenAI Codex CLI for code review, task delegation, and consultation.

## Architecture

- **MCP Server** (`src/`): One-direction bridge -- Claude Code calls Codex via `codex exec` CLI
- **Slash Commands** (`commands/`): `/codex-review`, `/codex-do`, `/codex-consult`
- **Auto-review Hook** (`hooks/`): PostToolUse hook with smart diff filtering
- **Setup CLI** (`setup/`): `npx skill-codex setup` one-command installer

## Key Design Decisions

- **Subscription-first**: Works with `codex login` (ChatGPT Plus/Codex subscription). No `OPENAI_API_KEY` required.
- **Codex as peer, not authority**: Claude critically evaluates all Codex output. Findings are suggestions, not directives.
- **Cross-platform**: Windows (git-bash), macOS, Linux. Uses `shell: false` with resolved binary path + `windowsHide: true` on Windows.
- **Single MCP tool** (`codex_exec`): Mode param controls behavior (exec vs full-auto).

## Code Conventions

- TypeScript strict mode, ES2022 target, Node16 modules
- Immutable data patterns -- never mutate, return new objects
- Small focused files: 50-150 lines typical, 400 max
- Typed errors with `retryable` boolean on `BridgeError` base class
- All magic numbers in `src/config/constants.ts`
- Cross-platform paths via `src/config/paths.ts` and `src/util/platform.ts`

## Testing

- Framework: vitest
- Target: 80%+ overall, 90%+ on runner and guards
- Mock `child_process.spawn` for runner tests
- Mock `which` for binary check tests
- Use temp dirs for lock file tests

## Build & Run

```bash
npm install
npm run build
npm test
```

## MCP Server

The server exposes one tool: `codex_exec` with params:
- `prompt` (string, required)
- `mode` ("exec" | "full-auto", default "exec")
- `cwd` (string, optional)
- `timeoutMs` (number, optional)
- `requireGit` (boolean, optional)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_CODEX_TIMEOUT_MS` | `600000` (10 min) | Subprocess timeout |
| `SKILL_CODEX_MAX_RETRIES` | `3` | Retry count for transient errors |
| `SKILL_CODEX_DEBUG` | -- | Enable debug logging to stderr |
| `SKILL_CODEX_DEPTH` | `0` | Recursion depth (set automatically) |

## Edge Case Handling

Pre-flight checks run in order (fail-fast): recursion -> binary -> auth -> lock -> git.
Retry on: 429, 5xx, network errors (exponential backoff with jitter).
No retry on: auth, CLI not found, recursion limit, lock conflict.
Timeout: 10min default, SIGTERM -> 5s grace -> SIGKILL.
Lock file: PID + timestamp, stale after 15min or dead PID.
