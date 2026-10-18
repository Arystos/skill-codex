# Security Policy

## Supported versions

skill-codex is published on npm and developed on the `master` branch. Security
fixes are applied to the latest published version. Please make sure you are on
the most recent release before reporting an issue.

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue
for an undisclosed vulnerability.

Open a [GitHub Security Advisory](https://github.com/Arystos/skill-codex/security/advisories/new)
(Security → Report a vulnerability) — this keeps the report private and lets us
collaborate on a fix.

Please include: affected version, a description of the issue, reproduction steps
or a proof of concept, and the potential impact. We aim to acknowledge reports
within a few days and to ship a fix or mitigation as quickly as is practical,
crediting reporters who wish to be credited.

## Security posture

skill-codex is a bridge between Claude Code and the OpenAI Codex CLI. Relevant
properties for anyone evaluating it:

- **No secrets stored.** It uses your existing `codex login` session
  (subscription auth). It does not read, store, or transmit your API keys.
- **Network calls** are only those the `codex` CLI itself makes to OpenAI when you
  invoke a tool. skill-codex adds no telemetry and phones no home.
- **Read-only by default.** `codex_exec` runs `--sandbox read-only` unless you
  explicitly request `workspace-write`; `danger-full-access` is opt-in and is
  expected to be gated by your own Claude Code permission settings.
- **Input is validated.** Tool parameters that reach the spawned process
  (`sessionId`, `model`, `reviewBase`, `reviewCommit`, and the Windows sandbox
  env override) are validated against strict allowlists to prevent shell-argument
  injection on the Windows `shell:true` spawn path.
- **Guardrails.** Per-call timeout, recursion-depth limit (prevents Codex calling
  itself in a loop), and a lock file (prevents concurrent runs in one workspace).
- **The subprocess prompt is passed via stdin**, never interpolated into a shell
  command line.

## Supply chain

How changes reach the npm package:

- **Every change goes through a pull request** on a protected `master`: CI must
  pass on Windows, macOS and Linux, and force pushes and branch deletion are
  blocked. CI on a pull request from an outside contributor runs only after a
  maintainer approves it, and never sees repository secrets.
- **PR safety checks** flag new dependencies with known vulnerabilities, and
  hidden Unicode (bidi controls, invisible tag characters) that could make code
  or agent instructions read differently from what they do.
- **Manual review** for any change to the files that run on your machine or
  steer an AI agent: `hooks/`, `commands/`, `skills/`, `setup/`, `bin/`, the
  plugin manifests, `package.json`/`package-lock.json` and `.github/`.
- **GitHub Actions are pinned to commit SHAs**; Dependabot keeps them and the
  npm dependencies current. CodeQL and secret scanning run on the repository.
- **Releases are published from a tagged commit by the `publish` workflow**
  with npm trusted publishing (no long-lived npm token) and a signed provenance
  statement you can check on the npm package page.

## Scope

skill-codex orchestrates the `codex` CLI; it does not control what Codex itself
does once invoked. Review Codex's own security model and your Claude Code
permission configuration as part of your threat model.
