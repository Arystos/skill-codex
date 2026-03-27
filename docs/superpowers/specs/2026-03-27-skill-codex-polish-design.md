# skill-codex v0.2.0 — Polish & Rename Design Spec

## Overview

Rename `codex-bridge` to `skill-codex` across all surfaces (npm, GitHub, MCP, env vars, docs) and ship a polish release that fixes all known bugs, raises test coverage to 80%+, adds CI/CD, and improves DX. No new features — this is a quality-and-identity release.

---

## 1. Rename

### Package & Binary

| Surface | Old | New |
|---------|-----|-----|
| npm package | `codex-bridge` | `skill-codex` |
| CLI binary | `codex-bridge` | `skill-codex` |
| `package.json` name | `codex-bridge` | `skill-codex` |

### GitHub

| Surface | Old | New |
|---------|-----|-----|
| Repository | `Arystos/codex-bridge` | `Arystos/skill-codex` |
| `package.json` repository URL | `github.com/Arystos/codex-bridge` | `github.com/Arystos/skill-codex` |
| README clone URL | `codex-bridge.git` | `skill-codex.git` |
| README badges | hardcoded refs | updated |

### MCP Server

| Surface | Old | New |
|---------|-----|-----|
| Server name in `server.ts` | `codex-bridge` | `skill-codex` |
| Registration key in `~/.claude.json` | `"codex-bridge"` | `"skill-codex"` |
| Setup installer writes | old key | new key |

### Environment Variables

| Old | New |
|-----|-----|
| `CODEX_BRIDGE_TIMEOUT_MS` | `SKILL_CODEX_TIMEOUT_MS` |
| `CODEX_BRIDGE_MAX_RETRIES` | `SKILL_CODEX_MAX_RETRIES` |
| `CODEX_BRIDGE_DEBUG` | `SKILL_CODEX_DEBUG` |
| `CODEX_BRIDGE_DEPTH` | `SKILL_CODEX_DEPTH` |

### Lock File

| Old | New |
|-----|-----|
| `.codex-bridge.lock` | `.skill-codex.lock` |

### Files Requiring Text Updates

- `package.json` — name, bin, repository, homepage, bugs
- `src/config/constants.ts` — all env var name constants, lock file name
- `src/server.ts` — server name string
- `src/lock/lock-file.ts` — lock file name (if hardcoded)
- `setup/install-mcp.ts` — MCP key name
- `setup/install-hook.ts` — hook script paths reference
- `setup/verify.ts` — verification checks
- `bin/codex-bridge.ts` — rename to `bin/skill-codex.ts`, update help text
- `CLAUDE.md` — all references
- `README.md` — all references, badges, clone URL
- `CONTRIBUTING.md` — all references
- `PLAN.md` — all references
- `tsup.config.ts` — entry points if referencing bin name
- `hooks/post-tool-use-review.ps1` — any path references
- `hooks/post-tool-use-review.sh` — any path references
- `commands/codex-do.md`, `codex-review.md`, `codex-consult.md` — any internal references to the bridge name (slash command names stay `/codex-*`)

### NOT Renamed

- Slash commands remain `/codex-review`, `/codex-do`, `/codex-consult` — these name the action target (Codex), not the package
- MCP tool name remains `codex_exec` — this is the tool's action, not the package identity

---

## 2. Bug Fixes

### 2.1 Windows SIGTERM (HIGH)

**File:** `src/runner/timeout.ts`

**Problem:** `child.kill("SIGTERM")` is silently ignored on Windows. The two-phase graceful-then-force kill collapses into nothing, and the grace timer fires uselessly.

**Fix:** Branch on `isWindows()`. On Windows, call `child.kill()` directly (which maps to `TerminateProcess`) and skip the grace timer. On Unix, keep the existing SIGTERM -> grace -> SIGKILL sequence.

### 2.2 checkAuth Uses Bare Binary Name (MEDIUM)

**File:** `src/guards/check-auth.ts`

**Problem:** `execFile("codex", ...)` uses bare name while `exec-runner.ts` resolves the full path via `which`. Could hit different binaries.

**Fix:** Accept the resolved binary path as a parameter (from the memoized resolution in 2.3). If not provided, resolve it internally.

### 2.3 Memoize Binary Resolution (MEDIUM)

**File:** `src/runner/exec-runner.ts`

**Problem:** `which("codex")` runs twice per tool call — once in `checkBinary()` (preflight) and once in `resolveCodexBinary()` (runner).

**Fix:** Create a module-level memoized resolver in `src/guards/check-binary.ts` that caches the result. Both preflight and runner use the same cached value. The cache lives for the process lifetime (binary path doesn't change mid-session).

### 2.4 Cache Auth Check (MEDIUM)

**File:** `src/guards/check-auth.ts`

**Problem:** Every tool call spawns a full `codex exec --ephemeral "echo ok"` subprocess for auth validation. Adds latency.

**Fix:** Add a 60-second TTL cache. On success, store the timestamp. Subsequent calls within 60s skip the subprocess. On auth failure, invalidate the cache.

### 2.5 Output Parser Discards Messages (MEDIUM)

**File:** `src/runner/output-parser.ts`

**Problem:** Each matching JSONL line overwrites `agentMessage` via `continue`. Only the last message survives.

**Fix:** Accumulate messages in an array. Join with `\n\n` at the end. If a `result` type is found, prefer it over accumulated `message` types.

### 2.6 CLAUDE.md Doc Mismatch (LOW)

**File:** `CLAUDE.md`

**Problem:** Says "Uses `shell: true` + `windowsHide: true` on Windows" but code uses `shell: false`.

**Fix:** Update to: "Uses `shell: false` with resolved absolute binary path + `windowsHide: true`"

---

## 3. Test Coverage

**Target:** 80%+ lines/functions/branches/statements.

**Framework:** vitest (already configured)

### Existing Tests (keep)

- `__tests__/runner/output-parser.test.ts`
- `__tests__/runner/retry.test.ts`
- `__tests__/filter/smart-filter.test.ts`
- `__tests__/guards/check-recursion.test.ts`
- `__tests__/util/truncate.test.ts`

### New Tests

| Test File | What It Covers | Mocking Strategy |
|-----------|---------------|------------------|
| `__tests__/runner/exec-runner.test.ts` | Arg construction, stdin injection, error classification, exit codes | Mock `spawn` from `child_process`, mock `which` |
| `__tests__/runner/timeout.test.ts` | SIGTERM/SIGKILL sequencing, Windows branch, clear() cleanup | Mock `ChildProcess`, use fake timers |
| `__tests__/guards/check-binary.test.ts` | Binary found, not found, memoization | Mock `which` |
| `__tests__/guards/check-auth.test.ts` | Auth success, auth expired, network error, ENOENT, TTL cache | Mock `execFile` |
| `__tests__/guards/check-lock.test.ts` | Lock check pass/fail | Mock lock-file module |
| `__tests__/lock/lock-file.test.ts` | Acquire, release, stale detection (>15min), dead PID | Temp directories, fake timers |
| `__tests__/guards/preflight.test.ts` | Check ordering (fail-fast), each check failing independently | Mock individual check modules |
| `__tests__/tools/codex-exec.test.ts` | MCP handler input validation, mode routing, error propagation | Mock runner + preflight |
| `__tests__/server.test.ts` | Tool registration, unknown tool handling | MCP SDK test utilities |

### Coverage Threshold

Add to `vitest.config.ts`:

```typescript
coverage: {
  provider: 'v8',
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  },
}
```

---

## 4. CI/CD

### `.github/workflows/ci.yml`

- **Trigger:** push to `main`/`master`, pull requests
- **Matrix:** Node 18, 20, 22 x ubuntu-latest, macos-latest, windows-latest
- **Steps:** checkout, setup-node, `npm ci`, `npm run lint`, `npm test`, `npm run test:coverage`
- **Cache:** `node_modules` via `actions/setup-node` built-in cache

### `.github/workflows/publish.yml`

- **Trigger:** push tags matching `v*`
- **Steps:** checkout, setup-node (registry-url: npm), `npm ci`, `npm run build`, `npm run test`, `npm publish`
- **Secret:** `NPM_TOKEN` (documented in CONTRIBUTING.md)

---

## 5. DX & Documentation

### CLI Improvements

- **`--help` / `-h`** — Recognized as valid subcommands, print usage, exit 0
- **`--version` / `-v`** — Print version read from `package.json` dynamically (not hardcoded)
- **Automated `uninstall`** — Actually remove: MCP entry from `~/.claude.json`, slash command files from `~/.claude/commands/`, hook entry from `~/.claude/settings.json`

### Debug Logging

- **Implement `SKILL_CODEX_DEBUG`** — Read the env var in key locations (preflight, runner, retry, timeout). Log to stderr with `[skill-codex]` prefix. Currently defined in constants but never read.

### README Updates

- Replace static version badge with dynamic `https://img.shields.io/npm/v/skill-codex`
- Add CI status badge: `https://github.com/Arystos/skill-codex/actions/workflows/ci.yml/badge.svg`
- Add sample output section showing what `/codex-review` returns
- Fix project structure to match actual directory layout
- Update all `codex-bridge` references to `skill-codex`

### package.json Updates

```json
{
  "homepage": "https://github.com/Arystos/skill-codex#readme",
  "bugs": { "url": "https://github.com/Arystos/skill-codex/issues" },
  "funding": { "type": "other", "url": "https://ko-fi.com/arystos" },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "keywords": [
    "claude-code", "codex", "openai", "anthropic", "mcp",
    "mcp-server", "model-context-protocol", "ai-coding",
    "code-review", "developer-tools", "codex-cli",
    "llm-tools", "ai-tools", "code-review-automation",
    "openai-codex", "skill"
  ]
}
```

### New Files

- **`CHANGELOG.md`** — Initial entry for v0.2.0 documenting the rename and all fixes
- Update **`CONTRIBUTING.md`** — Add npm publish instructions, `NPM_TOKEN` setup

### Renamed Files

- `bin/codex-bridge.ts` -> `bin/skill-codex.ts`

---

## 6. Minor Hardening

### 6.1 Retry Log Error Type

**File:** `src/runner/retry.ts`

**Current:** `"Transient error, retrying..."`
**New:** `"RateLimitError — retrying in ${delay}ms (attempt ${i}/${max})"`

### 6.2 tsup Shebang

**File:** `tsup.config.ts`

**Problem:** `#!/usr/bin/env node` banner added to ALL output files including `dist/index.js`.
**Fix:** Only add shebang to `bin/skill-codex.ts` entry point. Use separate `tsup` entry config or post-build script.

### 6.3 stdout Buffering

**File:** `src/runner/exec-runner.ts`

**Current:** `stdout += chunk.toString()` (repeated string concatenation)
**Fix:** `chunks.push(chunk)` then `Buffer.concat(chunks).toString()` at the end.

### 6.4 Remove Dead Code

**File:** `src/util/platform.ts`

Remove `getShell()` function — defined but never called anywhere.

---

## Out of Scope (Future)

These are deferred to a future feature release:
- Session management / multi-turn conversations
- Bidirectional communication
- Web search tool
- Web UI monitoring
- One-click IDE install buttons
- Per-project configuration file (`.skill-codex.json`)
- `codex-diff` slash command
- PreToolUse guard hook
- Streaming output
