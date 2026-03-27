# Contributing to skill-codex

Thanks for your interest in contributing! Here's how to get started.

## How to Contribute

1. **Fork** the repo
2. **Create a branch** from `master` (`git checkout -b my-feature`)
3. **Install dependencies** -- `npm install`
4. **Make your changes**
5. **Test** -- `npm test` (all 34 tests must pass)
6. **Type check** -- `npm run typecheck`
7. **Build** -- `npm run build`
8. **Commit** with a clear message (`feat:`, `fix:`, `chore:` prefixes)
9. **Push** and open a **Pull Request**

## What to Contribute

- **Bug fixes** -- if something doesn't work, fix it and open a PR
- **Platform testing** -- test on macOS/Linux, report or fix issues
- **New slash commands** -- add commands to `commands/` for common workflows
- **Better output parsing** -- Codex CLI output formats may change
- **Documentation** -- improve the README, add examples, write guides
- **Test coverage** -- add tests for guards, setup modules, or edge cases

## Development

skill-codex is a TypeScript project with no runtime framework -- just the MCP SDK, Zod, and `which`.

**Project structure:**
- `src/` -- MCP server, runner, guards, filter, errors
- `commands/` -- Slash command markdown files
- `hooks/` -- PostToolUse hook scripts (bash + PowerShell)
- `setup/` -- `npx skill-codex setup` installer
- `bin/` -- CLI entry point
- `__tests__/` -- vitest test suite

**Key files to understand first:**
- `src/runner/exec-runner.ts` -- spawns `codex exec` (the core)
- `src/guards/preflight.ts` -- orchestrates all pre-flight checks
- `src/tools/codex-exec.ts` -- MCP tool handler
- `src/filter/smart-filter.ts` -- diff analysis for auto-review gating

## Publishing to npm

For maintainers:

```shell
# 1. Ensure clean build and tests pass
npm run build && npm test

# 2. Bump version (patch/minor/major)
npm version patch

# 3. Publish
npm publish

# 4. Push tags
git push --follow-tags
```

## Guidelines

- Keep it simple -- small, focused PRs over large refactors
- Test your changes before opening a PR
- One feature per PR -- don't bundle unrelated changes
- No `shell: true` in spawn calls -- this was a security finding we already fixed
- Prompts go via stdin, never as positional args (shell injection prevention)
- Immutable data patterns -- return new objects, don't mutate

## Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Your OS, Node.js version, Codex CLI version
- Output of `npx skill-codex verify`
- Any error messages from Claude Code or the MCP server

## Feature Requests

Open an issue describing what you'd like and why. Keep it focused.

## Issue Labels

| Label | Use for |
|-------|---------|
| `bug` | Something isn't working |
| `enhancement` | Feature requests and suggestions |
| `question` | Need help or clarification |
| `windows` / `macos` / `linux` | Platform-specific issues |
| `security` | Security-related findings |
| `good first issue` | Easy tasks for newcomers |

## Questions?

Open an issue -- happy to help!
