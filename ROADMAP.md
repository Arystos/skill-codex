# Roadmap

Where skill-codex is headed. This is a living document — open an
[issue](https://github.com/Arystos/skill-codex/issues) or start a
[discussion](https://github.com/Arystos/skill-codex/discussions) to suggest or
champion anything here. Items labelled **good first issue** and **help wanted**
are great places to start contributing.

## ✅ Shipped

- `/codex-review`, `/codex-do`, `/codex-consult` slash commands + the `codex-bridge` auto-trigger agent skill
- Subscription auth (no API key); read-only by default
- **Model & reasoning-effort** selection per call; **native `codex exec review`** (diff-scoped)
- **Session memory** via `codex exec resume`
- Structured **APPROVED / WARNING / BLOCKED** review verdict + bounded fix→re-review loop
- **Live progress** streaming; timeout / anti-recursion / lock-file guards
- **Windows-native** (works around Codex's elevated-sandbox spawn bug); CI matrix on Windows/macOS/Linux × Node 18/20/22
- Installable as a **Claude Code plugin** and an **OpenAI Codex plugin**
- `SECURITY.md`, SHA-pinned Actions, 80% coverage gate

## 🔜 v0.9 — Community & polish

- Issue templates + contributor onboarding (this milestone)
- Act on feedback from the launch
- Recipe docs (e.g. cheap model for `/codex-do`, strong model + high effort for `/codex-review`)
- Get the marketplace + awesome-list listings live

## 🎯 v1.0 — Stability

- Freeze the `codex_exec` tool API surface
- Expand tests, including a real-Codex end-to-end smoke test (gated behind a CI secret)
- A `codex-cli-drift` guard in CI (diff `codex exec --help`) so upstream CLI changes are caught early
- Comprehensive docs

## 🧊 Icebox / help wanted

- `--output-schema` — return structured JSON findings from reviews
- `--add-dir` — multi-root / monorepo workspace support
- Image input (`-i`) pass-through
- A docs site

> Priorities shift with community input. Nothing here is a promise — it's an
> invitation. See [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.
