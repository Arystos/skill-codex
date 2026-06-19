#!/usr/bin/env bash
# Faithful reconstruction of a real Claude Code session for the README demo.
# "Before": the same model that wrote the code reviews it — and misses the bug.
set -euo pipefail
p() { printf "%b" "$1"; }
DIM='\033[2m'; CYN='\033[36m'; GRN='\033[32m'; RST='\033[0m'

sleep 0.4
p "${DIM}— Without skill-codex: Claude reviews its own change —${RST}\n\n"
sleep 0.8
p "${CYN}❯${RST} review my login change before I commit\n\n"
sleep 1.0
p "${GRN}●${RST} Looks solid — the diff is clean and the logic reads correctly.\n"
sleep 0.5
p "  No blocking issues. ${GRN}✓ Ready to commit.${RST}\n\n"
sleep 1.0
p "${DIM}  …but the model that wrote the code just graded its own homework.${RST}\n"
sleep 0.6
