# Security Policy

## Supported versions

skill-codex is published on npm and developed on the `master` branch. Security
fixes are applied to the latest published version. Please make sure you are on
the most recent release before reporting an issue.

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue
for an undisclosed vulnerability.

- Preferred: open a [GitHub Security Advisory](https://github.com/Arystos/skill-codex/security/advisories/new)
  (Security → Report a vulnerability).
- Alternatively: email **arystotelos@gmail.com** with the details.

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

## Scope

skill-codex orchestrates the `codex` CLI; it does not control what Codex itself
does once invoked. Review Codex's own security model and your Claude Code
permission configuration as part of your threat model.
