import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";

vi.mock("../../src/guards/preflight.js", () => ({ runPreflight: vi.fn() }));
vi.mock("../../src/runner/exec-runner.js", () => ({ execCodex: vi.fn() }));
vi.mock("../../src/runner/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../../src/codex/version-check.js", () => ({
  takeCodexVersionNotice: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../src/codex/models.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/codex/models.js")>()),
  listAvailableModels: vi.fn().mockResolvedValue([]),
  readConfiguredModel: vi.fn().mockReturnValue(null),
}));

import { runPreflight } from "../../src/guards/preflight.js";
import { execCodex } from "../../src/runner/exec-runner.js";
import { InvalidRequestError } from "../../src/errors/errors.js";
import { MAX_OUTPUT_SCHEMA_CHARS } from "../../src/config/constants.js";
import {
  handleCodexExec,
  inputSchema,
  OUTPUT_SCHEMA_DESCRIPTION,
  TOOL_INPUT_JSON_SCHEMA,
} from "../../src/tools/codex-exec.js";

const mockExecCodex = vi.mocked(execCodex);
const CWD = os.tmpdir();

const SCHEMA = {
  type: "object",
  properties: { severity: { type: "string" }, file: { type: "string" } },
  required: ["severity", "file"],
  additionalProperties: false,
};

describe("outputSchema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runPreflight).mockResolvedValue({ lockHandle: { release: vi.fn() } });
  });

  it("is advertised in the tools/list JSON schema with the zod description", () => {
    expect(TOOL_INPUT_JSON_SCHEMA.properties.outputSchema).toEqual({ type: "object", description: OUTPUT_SCHEMA_DESCRIPTION });
    expect(inputSchema.shape.outputSchema.description).toBe(OUTPUT_SCHEMA_DESCRIPTION);
  });

  it("accepts a JSON object and rejects other JSON values", () => {
    expect(inputSchema.safeParse({ prompt: "x", outputSchema: SCHEMA }).success).toBe(true);
    expect(inputSchema.safeParse({ prompt: "x", outputSchema: "schema.json" }).success).toBe(false);
    expect(inputSchema.safeParse({ prompt: "x", outputSchema: [SCHEMA] }).success).toBe(false);
  });

  it("rejects a schema larger than the cap", () => {
    const big = { type: "object", description: "x".repeat(MAX_OUTPUT_SCHEMA_CHARS) };
    const parsed = inputSchema.safeParse({ prompt: "x", outputSchema: big });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain(`at most ${MAX_OUTPUT_SCHEMA_CHARS} characters`);
  });

  it("rejects outputSchema with review", async () => {
    const result = await handleCodexExec({ mode: "exec", review: true, outputSchema: SCHEMA, requireGit: false }, CWD);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("INVALID_OPTIONS");
    expect(mockExecCodex).not.toHaveBeenCalled();
  });

  it("writes the schema to a temp file for Codex, then deletes it", async () => {
    let seen: { path: string; content: string } | null = null;
    mockExecCodex.mockImplementation(async (params) => {
      const p = params.outputSchemaPath as string;
      seen = { path: p, content: fs.readFileSync(p, "utf-8") };
      const final = '{"severity":"high","file":"a.ts"}';
      return { content: final, finalMessage: final, activity: [], usage: null, raw: "" };
    });

    const result = await handleCodexExec({ prompt: "review", mode: "exec", outputSchema: SCHEMA, requireGit: false }, CWD);

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(seen!.content)).toEqual(SCHEMA);
    expect(fs.existsSync(seen!.path)).toBe(false);
    expect(result.content[0].text).toContain("structured output: JSON constrained by outputSchema");
    expect(result.content[0].text).toContain('"severity": "high"');
  });

  it("deletes the temp file when the run fails", async () => {
    let schemaPath = "";
    mockExecCodex.mockImplementation(async (params) => {
      schemaPath = params.outputSchemaPath as string;
      throw new InvalidRequestError("Invalid schema for response_format 'codex_output_schema'");
    });

    const result = await handleCodexExec({ prompt: "x", mode: "exec", outputSchema: SCHEMA, requireGit: false }, CWD);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid schema for response_format");
    expect(schemaPath).not.toBe("");
    expect(fs.existsSync(schemaPath)).toBe(false);
  });

  it("keeps one schema file across a model fallback retry", async () => {
    mockExecCodex
      .mockRejectedValueOnce(new InvalidRequestError("The 'm1' model is not supported."))
      .mockResolvedValueOnce({ content: "{}", finalMessage: "{}", activity: [], usage: null, raw: "" });

    await handleCodexExec({ prompt: "x", mode: "exec", model: "m1", outputSchema: SCHEMA, requireGit: false }, CWD);

    const [first, second] = mockExecCodex.mock.calls.map((c) => c[0].outputSchemaPath);
    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it("passes no schema path when outputSchema is absent", async () => {
    mockExecCodex.mockResolvedValue({ content: "ok", activity: [], usage: null, raw: "" });
    await handleCodexExec({ prompt: "x", mode: "exec", requireGit: false }, CWD);
    expect(mockExecCodex.mock.calls[0]?.[0].outputSchemaPath).toBeUndefined();
  });
});
