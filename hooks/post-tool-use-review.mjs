#!/usr/bin/env node
// Cross-platform PostToolUse hook for the skill-codex Claude Code plugin.
// Reads the hook JSON on stdin and prints a suggestion to run /codex-review
// after significant code changes. Node is always available (the MCP server
// needs it), so this one script replaces the per-platform .sh/.ps1 used by the
// npx-setup install path. Best-effort: never throws, never blocks.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const TRIGGER_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const SECURITY_KEYWORDS = ["auth", "security", "crypto", "password", "secret", "token"];
const FORCE_REVIEW_FILES = 3;
const FORCE_REVIEW_LINES = 100;

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function main() {
  let input = "";
  try {
    input = readFileSync(0, "utf-8");
  } catch {
    return; // no stdin — nothing to do
  }

  let toolName = "";
  try {
    toolName = JSON.parse(input).tool_name ?? "";
  } catch {
    return; // non-JSON input
  }

  if (!TRIGGER_TOOLS.has(toolName)) return;
  if (process.env.SKILL_CODEX_DEPTH) return; // inside a Codex run — don't recurse
  if (!git("rev-parse --is-inside-work-tree").trim()) return; // not a git repo

  // Collect changed files, including new untracked ones (porcelain catches them).
  const files = new Set();
  for (const f of git("diff --name-only").split("\n")) {
    if (f.trim()) files.add(f.trim());
  }
  for (const line of git("status --porcelain").split("\n")) {
    const f = line.slice(3).trim();
    if (f) files.add(f);
  }

  // Total changed lines from the diffstat summary line.
  const statLine = git("diff --stat").trim().split("\n").pop() ?? "";
  let lines = 0;
  const ins = statLine.match(/(\d+) insertion/);
  const del = statLine.match(/(\d+) deletion/);
  if (ins) lines += Number.parseInt(ins[1], 10);
  if (del) lines += Number.parseInt(del[1], 10);

  const securityHit = [...files].some((f) =>
    SECURITY_KEYWORDS.some((k) => f.toLowerCase().includes(k)),
  );

  if (securityHit) {
    process.stdout.write(
      "[skill-codex] Security-sensitive files changed — consider /codex-review before committing.\n",
    );
  } else if (files.size >= FORCE_REVIEW_FILES || lines >= FORCE_REVIEW_LINES) {
    process.stdout.write(
      `[skill-codex] Significant changes (${files.size} files, ~${lines} lines) — consider /codex-review.\n`,
    );
  }
}

try {
  main();
} catch {
  // best-effort — a hook must never break the session
}
