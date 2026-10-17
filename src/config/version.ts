import fs from "node:fs";
import path from "node:path";
import { getPackageRoot } from "./package-root.js";

const UNKNOWN_VERSION = "0.0.0";

/** skill-codex version from package.json, so the server and CLI never drift from the published one. */
export function getVersion(root: string = getPackageRoot()): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as {
      version?: unknown;
    };
    return typeof pkg.version === "string" ? pkg.version : UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}

export interface BuildInfo {
  readonly version: string;
  readonly root: string;
  /** mtime of dist/index.js — tells which build is actually running. Null when not built. */
  readonly builtAt: Date | null;
}

export function getBuildInfo(root: string = getPackageRoot()): BuildInfo {
  let builtAt: Date | null = null;
  try {
    builtAt = fs.statSync(path.join(root, "dist", "index.js")).mtime;
  } catch {
    // not built (running from source, e.g. under vitest)
  }
  return { version: getVersion(root), root, builtAt };
}

export function formatBuildInfo(info: BuildInfo): string {
  const built = info.builtAt ? `built ${info.builtAt.toISOString()}` : "not built";
  return `skill-codex v${info.version} (${built}) from ${info.root}`;
}
