# skill-codex demo — scripted, reproducible terminal GIF (before / after)
#
# Render from the repo root:
#   vhs docs/demo/demo.tape      ->   writes docs/demo.gif
# Requires vhs:  https://github.com/charmbracelet/vhs
#
# The "before" act = Claude reviewing its own change (misses the bug).
# The "after"  act = /codex-review: a second model (Codex) catches it.

Output docs/demo.gif

Require bash

Set Shell bash
Set FontSize 18
Set Width 1280
Set Height 760
Set Theme "Dracula"
Set Padding 24
Set TypingSpeed 45ms

# Move into the demo dir without showing the cd
Hide
Type "cd docs/demo" Enter
Type "clear" Enter
Show
Sleep 600ms

# ── BEFORE ───────────────────────────────────────────────────────
Type "bash before.sh" Enter
Sleep 4.5s

Type "clear" Enter
Sleep 500ms

# ── AFTER ────────────────────────────────────────────────────────
Type "bash after.sh" Enter
Sleep 6.5s
