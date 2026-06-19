# Distribution Checklist

A prioritized, evidence-backed plan to get skill-codex in front of the people who want it, ordered by leverage. This is a checklist, not marketing copy.

**Why this matters:** the Claude↔Codex bridge category is crowded and contested even by OpenAI's own plugin (`codex-plugin-cc`, ~21k★). Across the ecosystem, distribution + trust signals separate the recognized tools from the 2-star long tail far more than feature count does. skill-codex's edge is operational (subscription auth, *tested* Windows, never-frozen runs, guardrails) — the job below is to make that edge visible and reachable.

---

## 0. Pre-launch readiness (credibility signals)

- [x] Cross-OS CI — Windows/macOS/Linux × Node 18/20/22 (9-way matrix)
- [x] Test suite (19 files, 149 tests) + 80% coverage gate enforced in CI
- [x] MIT license
- [x] README leads with the wedge, an honest comparison table, and the "why not just use Claude subagents?" answer
- [ ] **Demo GIF** — record ~20s of `/codex-review` catching a *real* bug; save to `docs/demo.gif`; uncomment the image line near the top of the README. Highest-impact single asset. (Tools: ScreenToGif on Windows, or asciinema → agg.)
- [ ] Enable Codecov (codecov.io → add `Arystos/skill-codex`), then uncomment the Codecov badge in the README. Add a `CODECOV_TOKEN` repo secret only if tokenless upload doesn't work.
- [ ] Publish `v0.6.0` to npm (`npm publish`) so the version/downloads badges reflect the latest.
- [ ] Smoke-test `npx skill-codex setup` from a clean machine on Windows + macOS/Linux.

## 1. Official Anthropic plugin marketplace  (highest trust + distribution)

- [ ] Read submission requirements at `anthropics/claude-plugins-official` (quality + security standards; submission form).
- [ ] Confirm the plugin manifest/metadata conforms.
- [ ] Submit. Marketplace listing is the top driver — listed plugins show install counts in the hundreds of thousands.

## 2. "Awesome" lists  (low effort, good reach — usually just an issue/PR)

- [ ] `hesreallyhim/awesome-claude-code`
- [ ] `ccplugins/awesome-claude-code-plugins`
- [ ] `ComposioHQ/awesome-claude-plugins`
- [ ] `hashgraph-online/awesome-codex-plugins`

## 3. Show HN

- [ ] Title angle: "Show HN: skill-codex — use Codex from Claude Code with your subscription (Windows-native)".
- [ ] Lead with the demo GIF + the operational angle (no API key, real Windows support, never freezes). MIT, drop-in install.
- [ ] Be present in comments. Pre-empt "why not just use Claude subagents?" → same model = correlated blind spots; a different model family catches what Claude is confidently wrong about.

## 4. Reddit  (best subs: r/ClaudeCode, r/codex; then r/ChatGPTCoding)

- [ ] Post a credentialed "how I use it / what it caught" write-up — NOT a bare promo. Reddit punishes "I built X" promos and anything that reads "vibecoded"; depth + a real stack + a balanced verdict is what gets upvoted.
- [ ] Include the demo GIF and a concrete before/after (a bug Codex caught that Claude missed).
- [ ] Echo the community's own language ("two models rarely make the same mistake", "checks & balances", "stop grading your own homework").

## 5. Ongoing

- [ ] Watch for Codex CLI drift (flag/JSONL changes) — note tested CLI versions in the CHANGELOG. (Currently verified against codex-cli 0.133.0.)
- [ ] Respond to issues quickly — responsiveness is itself a recognition lever.
- [ ] Add editor one-click install buttons (VS Code / Cursor) to the README once the marketplace listing is live.

---

*Evidence basis: GitHub scan of 8+ Codex-MCP repos + community research across Reddit/HN/blogs/forums. Third-party leader to beat: `tuannvm/codex-mcp-server` (490★, documents API-key auth, Ubuntu-only CI). Category also contested by OpenAI's official `codex-plugin-cc` (~21k★, no documented Windows support).*
