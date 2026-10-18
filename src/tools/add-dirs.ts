import fs from "node:fs";
import path from "node:path";
import { isShellSafePath } from "../runner/path-arg.js";

/** The `addDirs` input after validation: absolute, existing, de-duplicated directories. */
export type AddDirsResult = { readonly ok: true; readonly dirs: readonly string[] } | { readonly ok: false; readonly error: string };

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false; // missing or unreadable: reported as "not an existing directory"
  }
}

/**
 * Validate `addDirs` at the tool boundary. A relative entry resolves against
 * the workspace `cwd`. Each directory must exist and contain only characters
 * that are safe on the Windows shell spawn (see path-arg.ts). Duplicates are
 * dropped, keeping the first occurrence.
 */
export function resolveAddDirs(addDirs: readonly string[], cwd: string): AddDirsResult {
  const dirs: string[] = [];
  for (const entry of addDirs) {
    const dir = path.resolve(cwd, entry);
    if (!isShellSafePath(dir)) {
      return { ok: false, error: `addDirs entry contains characters that are unsafe to pass to codex (allowed: letters, digits, space, . _ - : \\ / ( ) + @ , ~ ' # [ ] { } =): ${dir}` };
    }
    if (!isDirectory(dir)) {
      return { ok: false, error: `addDirs entry is not an existing directory: ${dir}` };
    }
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return { ok: true, dirs };
}
