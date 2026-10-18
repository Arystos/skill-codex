import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCodexCommand } from "./cli.js";

export interface ModelInfo {
  readonly slug: string;
  readonly description: string;
}

// Same shape the `model` tool parameter accepts — anything else is dropped so
// catalog content can't smuggle odd text into the tool description.
const SAFE_SLUG = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_DESCRIPTION_CHARS = 120;

let cachedModels: readonly ModelInfo[] | null = null;

export function resetModelCache(): void {
  cachedModels = null;
}

function toModelInfo(entry: unknown): (ModelInfo & { priority: number }) | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  if (typeof e.slug !== "string" || !SAFE_SLUG.test(e.slug) || e.visibility !== "list") return null;
  const description = typeof e.description === "string" ? e.description.trim().slice(0, MAX_DESCRIPTION_CHARS) : "";
  const priority = typeof e.priority === "number" ? e.priority : Number.MAX_SAFE_INTEGER;
  return { slug: e.slug, description, priority };
}

/**
 * Parse `codex debug models` output: the account's model catalog. Keeps only
 * user-visible models (visibility "list"), ordered by Codex's own priority.
 */
export function parseModelCatalog(raw: unknown): ModelInfo[] {
  const list = Array.isArray(raw) ? raw : (raw as { models?: unknown } | null)?.models;
  if (!Array.isArray(list)) return [];
  return list
    .map(toModelInfo)
    .filter((m): m is ModelInfo & { priority: number } => m !== null)
    .sort((a, b) => a.priority - b.priority)
    .map(({ slug, description }) => ({ slug, description }));
}

/**
 * Models this Codex account can use. The catalog depends on the ChatGPT plan
 * and changes between Codex releases, so it is read live rather than frozen.
 * Cached for the process lifetime once it succeeds; returns [] on failure.
 */
export async function listAvailableModels(): Promise<readonly ModelInfo[]> {
  if (cachedModels) return cachedModels;
  const result = await runCodexCommand(["debug", "models"]);
  if (!result.ok) return [];
  try {
    const models = parseModelCatalog(JSON.parse(result.stdout));
    if (models.length > 0) cachedModels = models;
    return models;
  } catch {
    return [];
  }
}

function getCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}

/** The top-level `model = "..."` from Codex's config.toml, or null when unset. */
export function readConfiguredModel(): string | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(getCodexHome(), "config.toml"), "utf-8");
  } catch {
    return null;
  }
  // Top-level keys end at the first [table] header.
  const topLevel = text.split(/^\s*\[/m)[0] ?? "";
  const match = topLevel.match(/^\s*model\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
}

/** Bullet list of models for the `model` tool parameter; "" when none are known. */
export function describeModelsForTool(models: readonly ModelInfo[], configuredDefault: string | null): string {
  if (models.length === 0) return "";
  const lines = models.map((m) => {
    const isDefault = m.slug === configuredDefault ? " (user's default)" : "";
    return `- ${m.slug}: ${m.description || "no description"}${isDefault}`;
  });
  return `Models available on this Codex account:\n${lines.join("\n")}`;
}
