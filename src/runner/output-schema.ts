import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OUTPUT_SCHEMA_DIR_PREFIX } from "../config/constants.js";

/** A JSON Schema written to disk for `codex exec --output-schema <FILE>`. */
export interface OutputSchemaFile {
  readonly path: string;
  /** Deletes the file and its private temp directory. Safe to call twice. */
  readonly cleanup: () => void;
}

/**
 * Write an inline JSON Schema to a fresh temp directory, because Codex takes
 * the schema only as a file path. Codex reads the file once at startup, but
 * the caller keeps it until the call ends: a retry or model fallback starts a
 * new Codex process that reads it again.
 */
export function writeOutputSchemaFile(
  schema: Readonly<Record<string, unknown>>,
  tmpRoot: string = os.tmpdir(),
): OutputSchemaFile {
  const dir = fs.mkdtempSync(path.join(tmpRoot, OUTPUT_SCHEMA_DIR_PREFIX));
  const file = path.join(dir, "schema.json");
  fs.writeFileSync(file, JSON.stringify(schema), "utf-8");

  let removed = false;
  const cleanup = (): void => {
    if (removed) return;
    removed = true;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      // A leftover temp file is harmless; report it instead of failing the call.
      process.stderr.write(`[skill-codex] Could not remove output schema dir ${dir}: ${String(err)}\n`);
    }
  };
  return { path: file, cleanup };
}
