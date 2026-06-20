# Launch kit (local drafts)

Copy for the distribution push. These are drafts for you to review and post —
nothing here is auto-published.

- `show-hn.md` — Show HN title + body
- `reddit.md` — r/ClaudeCode + r/codex posts
- `awesome-lists.md` — entries + target lists + how to PR
- `marketplace.md` — Anthropic marketplace submission (note: needs a plugin manifest first)

## Status of the 4 distribution steps

1. **Demo GIF** — needs `vhs` installed locally (`winget install charmbracelet.vhs`),
   then `vhs docs/demo/demo.tape` → `docs/demo.gif`, then uncomment the image line
   near the top of the main README. (ffmpeg is present; vhs + ttyd are not.)
2. **Codecov badge** — enable the repo on codecov.io (your account), then uncomment
   the codecov badge in the main README. CI already uploads coverage.
3. **Marketplace + awesome-lists** — copy ready in `marketplace.md` / `awesome-lists.md`.
   Awesome-list PRs can be opened on request; marketplace likely needs a plugin manifest.
4. **Launch posts** — copy ready in `show-hn.md` / `reddit.md`.

Done already: published to npm (`skill-codex@0.7.1`, latest).
