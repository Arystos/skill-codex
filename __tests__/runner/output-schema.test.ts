import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeOutputSchemaFile } from "../../src/runner/output-schema.js";
import { OUTPUT_SCHEMA_DIR_PREFIX } from "../../src/config/constants.js";

const SCHEMA = {
  type: "object",
  properties: { answer: { type: "integer" } },
  required: ["answer"],
  additionalProperties: false,
};

describe("writeOutputSchemaFile", () => {
  let root: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes the schema as JSON into its own temp directory", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-schema-test-"));
    const file = writeOutputSchemaFile(SCHEMA, root);

    expect(path.basename(path.dirname(file.path)).startsWith(OUTPUT_SCHEMA_DIR_PREFIX)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file.path, "utf-8"))).toEqual(SCHEMA);
    file.cleanup();
  });

  it("removes the file and its directory on cleanup, and tolerates a second call", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-schema-test-"));
    const file = writeOutputSchemaFile(SCHEMA, root);
    const dir = path.dirname(file.path);

    file.cleanup();
    file.cleanup();
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("reports a failed cleanup on stderr instead of throwing", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-schema-test-"));
    const file = writeOutputSchemaFile(SCHEMA, root);
    vi.spyOn(fs, "rmSync").mockImplementation(() => {
      throw new Error("EBUSY");
    });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() => file.cleanup()).not.toThrow();
    expect(String(stderr.mock.calls[0]?.[0])).toContain("Could not remove output schema dir");
  });
});
