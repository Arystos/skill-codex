# Demo GIF

A scripted, reproducible terminal demo for the README hero — a **before / after** that
shows where skill-codex stands out: *Claude grading its own homework* → *a second model
(Codex) catching the bug Claude waved through.*

## Render

1. Install [vhs](https://github.com/charmbracelet/vhs):
   `winget install charmbracelet.vhs`  (or `scoop install vhs`)
2. From the **repo root**: `vhs docs/demo/demo.tape` → writes `docs/demo.gif`
3. Uncomment the `![skill-codex demo](docs/demo.gif)` line near the top of the main `README.md`.

## What it shows

- **before.sh** — a Claude Code session reviewing its own change and approving it (the
  "grading your own homework" problem).
- **after.sh** — `/codex-review`: Codex (a different model) flags the CRITICAL bug,
  returns `Verdict: BLOCKED`, then `APPROVED` after the fix.

The output format mirrors the real `codex_exec` response (mode/cwd/token header, live
progress, verdict), so the GIF is deterministic and looks like a real session.

## Want literally-real output in the "after"?

Swap the body of `after.sh` for a genuine call against the planted bug:

```bash
codex exec --sandbox read-only \
  "Review buggy-login.ts. For each finding give severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, and a fix."
```

(Real Codex findings, non-deterministic timing — re-render until you get a clean take.)

## Keep it light

Target < ~4 MB so it loads fast on GitHub: lower `FontSize`/`Width` in `demo.tape`, or
post-process with [gifski](https://gif.ski/):

```bash
ffmpeg -i docs/demo.gif -vf "fps=12,scale=1000:-1:flags=lanczos" /tmp/f/%04d.png
gifski -o docs/demo.gif /tmp/f/*.png --quality 80
```

## Side-by-side variant

Prefer two images side by side (like many repos)? Render `before.sh` and `after.sh` into
two separate GIFs (one `Output` each in two small tapes) and place them in a two-column
Markdown table in the README.
