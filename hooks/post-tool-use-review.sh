#!/usr/bin/env bash
# codex-bridge: PostToolUse hook for auto-review suggestions
# Triggered after Write/Edit tool usage in Claude Code
# Outputs a suggestion for Claude to consider — does NOT auto-call MCP

# Read hook input from stdin (JSON with tool info)
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)

# Only trigger for write/edit tools
case "$TOOL_NAME" in
  Write|Edit|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

# Skip if we're already inside a bridge call (prevent recursion)
if [ -n "$CODEX_BRIDGE_DEPTH" ]; then
  exit 0
fi

# Check if git is available and we're in a repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

# Get summary of uncommitted changes
CHANGED_FILES=$(git diff --name-only 2>/dev/null)
CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -c . 2>/dev/null || echo "0")
LINES_CHANGED=$(git diff --stat 2>/dev/null | tail -1 | grep -o '[0-9]* insertion' | grep -o '[0-9]*' || echo "0")
LINES_DELETED=$(git diff --stat 2>/dev/null | tail -1 | grep -o '[0-9]* deletion' | grep -o '[0-9]*' || echo "0")
TOTAL_LINES=$((LINES_CHANGED + LINES_DELETED))

# Check for security-sensitive paths
SECURITY_HIT=""
for keyword in auth security crypto password secret token; do
  if echo "$CHANGED_FILES" | grep -qi "$keyword"; then
    SECURITY_HIT="yes"
    break
  fi
done

# Decide whether to suggest review
if [ -n "$SECURITY_HIT" ]; then
  echo "[codex-bridge] Security-sensitive files modified. Consider running /codex-review before committing."
elif [ "$CHANGED_COUNT" -ge 3 ] || [ "$TOTAL_LINES" -ge 100 ]; then
  echo "[codex-bridge] Significant changes detected ($CHANGED_COUNT files, ~$TOTAL_LINES lines). Consider running /codex-review."
fi

exit 0
