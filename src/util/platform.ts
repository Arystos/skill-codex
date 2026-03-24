import os from "node:os";
import path from "node:path";

export type Platform = "win32" | "darwin" | "linux";

export function getPlatform(): Platform {
  const p = os.platform();
  if (p === "win32" || p === "darwin" || p === "linux") return p;
  return "linux"; // default fallback for other unix-like
}

export function isWindows(): boolean {
  return getPlatform() === "win32";
}

export function getShell(): string {
  if (isWindows()) {
    return process.env["COMSPEC"] ?? "cmd.exe";
  }
  return process.env["SHELL"] ?? "/bin/bash";
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function getHomeDir(): string {
  return os.homedir();
}

export function getClaudeDir(): string {
  return path.join(getHomeDir(), ".claude");
}

export function getTempDir(): string {
  return os.tmpdir();
}
