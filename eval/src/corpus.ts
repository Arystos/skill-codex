import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { MANIFEST_PATH } from "./constants.js";
import { loadManifest } from "./manifest.js";
import type { BugCase, LoadedCase } from "./types.js";

/**
 * Corpus loading: take each validated manifest case and attach the text of its
 * diff file. Diff paths in the manifest are relative to the manifest itself, so
 * a moved corpus directory stays internally consistent.
 */

/** Read one diff file, resolving its path relative to the manifest location. */
export async function loadDiff(
  bugCase: BugCase,
  manifestPath: string = MANIFEST_PATH,
): Promise<string> {
  const diffPath = resolve(dirname(manifestPath), bugCase.diff);
  try {
    const text = await readFile(diffPath, "utf8");
    if (!text.trim()) {
      throw new Error("diff file is empty");
    }
    return text;
  } catch (err) {
    throw new Error(
      `Could not load diff for case "${bugCase.id}" (${diffPath}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Load the full corpus: validated manifest joined with every diff's text.
 * Returns a new readonly array of LoadedCase — never mutates the manifest cases.
 */
export async function loadCorpus(
  manifestPath: string = MANIFEST_PATH,
): Promise<readonly LoadedCase[]> {
  const manifest = await loadManifest(manifestPath);
  const loaded = await Promise.all(
    manifest.cases.map(async (bugCase): Promise<LoadedCase> => {
      const diffText = await loadDiff(bugCase, manifestPath);
      return { ...bugCase, diffText };
    }),
  );
  return Object.freeze(loaded);
}
