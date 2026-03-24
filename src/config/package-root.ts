import fs from "node:fs";
import path from "node:path";

/**
 * Resolves the package root directory by walking up from the current file
 * until we find package.json. Works both in dev (src/) and after bundling (dist/).
 */
export function getPackageRoot(): string {
  const thisFile = new URL(import.meta.url).pathname;
  const normalized = process.platform === "win32" && thisFile.startsWith("/")
    ? thisFile.slice(1)
    : thisFile;

  let dir = path.dirname(normalized);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // Fallback: assume 2 levels up from dist/bin/
  return path.resolve(path.dirname(normalized), "..", "..");
}
