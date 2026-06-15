/**
 * Collapse all whitespace runs to single spaces, trim, and truncate to `max`
 * characters with an ellipsis. Shared by the live file logger and the MCP
 * progress formatter so a single codex event renders consistently in both.
 */
export function oneLine(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? collapsed.slice(0, max - 1) + "…" : collapsed;
}

/** Last path segment, for compact progress lines. Falls back to the input. */
export function baseName(p: string): string {
  if (!p) return "file";
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}
