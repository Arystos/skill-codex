import { readFile } from "node:fs/promises";
import { z } from "zod";
import { MANIFEST_PATH } from "./constants.js";
import type { BugCase } from "./types.js";

/**
 * Manifest loading + validation.
 *
 * The manifest is external data (hand-authored JSON), so we validate it at the
 * boundary with zod and fail fast on any malformed entry — never trust the
 * file's shape. A bad manifest is a hard error: a silently-skipped case would
 * inflate the catch rate.
 */

const SUPPORTED_LANGUAGES = ["typescript", "javascript", "python", "go"] as const;

const BugCaseSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "id must be kebab-case (lowercase, digits, hyphens)"),
    diff: z.string().min(1),
    language: z.enum(SUPPORTED_LANGUAGES),
    category: z.string().min(1),
    file: z.string().min(1),
    line: z.number().int().positive(),
    title: z.string().min(1),
    bug: z.string().min(1),
    correctReviewShouldFlag: z.string().min(1),
    expectedSignals: z.array(z.string().min(1)).min(1),
    locationSignals: z.array(z.string().min(1)).min(1),
    minSignalHits: z.number().int().positive(),
  })
  .strict()
  // minSignalHits can never be satisfiable if it exceeds the available signals.
  .refine((c) => c.minSignalHits <= c.expectedSignals.length, {
    message: "minSignalHits exceeds the number of expectedSignals",
    path: ["minSignalHits"],
  });

const ManifestSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  cases: z.array(BugCaseSchema).min(1),
});

export interface Manifest {
  readonly version: number;
  readonly cases: readonly BugCase[];
}

/**
 * Validate an already-parsed object as a manifest. Pure and synchronous so it
 * can be unit-tested without touching the filesystem. Throws a descriptive
 * Error (aggregating every zod issue) if invalid, and additionally rejects
 * duplicate case ids — a duplicate would double-count one bug.
 */
export function validateManifest(data: unknown): Manifest {
  const parsed = ManifestSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid eval manifest:\n${issues}`);
  }

  const ids = parsed.data.cases.map((c) => c.id);
  const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate case id(s) in manifest: ${[...new Set(duplicates)].join(", ")}`,
    );
  }

  // Freeze the returned structure to keep the immutable contract.
  return Object.freeze({
    version: parsed.data.version,
    cases: Object.freeze(parsed.data.cases.map((c) => Object.freeze(c))),
  });
}

/** Load and validate the on-disk manifest. */
export async function loadManifest(path: string = MANIFEST_PATH): Promise<Manifest> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read eval manifest at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Eval manifest is not valid JSON (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return validateManifest(data);
}
