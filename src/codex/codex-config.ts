import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function getCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}

/**
 * A string value from Codex's config.toml: a top-level key when `table` is
 * null, otherwise a key inside `[table]`. Covers the flat `key = "value"` form
 * Codex writes; returns null when the file, table or key is missing.
 */
export function readConfigString(key: string, table: string | null = null): string | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(getCodexHome(), "config.toml"), "utf-8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const start = table === null ? 0 : lines.findIndex((l) => l.trim() === `[${table}]`) + 1;
  if (table !== null && start === 0) return null;

  const valuePattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`);
  for (const line of lines.slice(start)) {
    if (/^\s*\[/.test(line)) break; // next table: the key isn't in this one
    const match = line.match(valuePattern);
    if (match) return match[1] ?? null;
  }
  return null;
}
