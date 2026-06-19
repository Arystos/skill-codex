#!/usr/bin/env bash
# Faithful reconstruction of a real /codex-review run for the README demo.
# "After": a different model (Codex) reviews the same change — and catches it.
# Output format mirrors the real codex_exec response (header, live progress, verdict).
set -euo pipefail
p() { printf "%b" "$1"; }
DIM='\033[2m'; CYN='\033[36m'; GRN='\033[32m'; YEL='\033[33m'; RED='\033[31m'; MAG='\033[35m'; BLD='\033[1m'; RST='\033[0m'

sleep 0.4
p "${DIM}— With skill-codex: a different model (Codex) reviews —${RST}\n\n"
sleep 0.7
p "${CYN}❯${RST} /codex-review\n\n"
sleep 0.8
p "${MAG}●${RST} Delegating review to Codex…\n"
sleep 0.6
p "${DIM}  running: git diff${RST}\n"
sleep 0.5
p "${DIM}  Codex working… 3s elapsed${RST}\n\n"
sleep 0.9
p "${DIM}[read-only │ ~/app │ 3.4s │ 28,761 tok in → 146 out]${RST}\n"
sleep 0.5
p "${BLD}${RED}Verdict: BLOCKED${RST} — 1 CRITICAL\n\n"
sleep 0.7
p "${RED}CRITICAL${RST} — src/auth/login.ts:42\n"
sleep 0.3
p "  Password check uses ${YEL}==${RST} (timing-unsafe + type coercion).\n"
p "  e.g. ${DIM}'0e1' == '0e9'${RST} can pass via numeric coercion.\n"
p "  Use a constant-time compare (crypto.timingSafeEqual).\n\n"
sleep 1.6
p "${GRN}●${RST} Fixed it, re-ran review → ${BLD}${GRN}Verdict: APPROVED${RST} ✓\n"
sleep 0.6
