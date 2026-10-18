import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
import { MAX_ADD_DIRS } from "../../src/config/constants.js";
import {
  ADD_DIRS_DESCRIPTION,
  handleCodexExec,
  inputSchema,
  TOOL_INPUT_JSON_SCHEMA,
} from "../../src/tools/codex-exec.js";

const mockExecCodex = vi.mocked(execCodex);

describe("addDirs", () => {
  let root: string;
  let ws: string;
  let other: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-exec-adddirs-"));
    ws = path.join(root, "app");
    other = path.join(root, "lib");
    fs.mkdirSync(ws);
    fs.mkdirSync(other);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runPreflight).mockResolvedValue({ lockHandle: { release: vi.fn() } });
    mockExecCodex.mockResolvedValue({ content: "done", activity: [], usage: null, raw: "" });
  });

  it("is advertised in the tools/list JSON schema with the zod description", () => {
    expect(TOOL_INPUT_JSON_SCHEMA.properties.addDirs).toMatchObject({ type: "array", maxItems: MAX_ADD_DIRS });
    expect(inputSchema.shape.addDirs.description).toBe(ADD_DIRS_DESCRIPTION);
  });

  it("caps the number of entries and rejects empty strings", () => {
    const many = Array.from({ length: MAX_ADD_DIRS + 1 }, (_, i) => `/d${i}`);
    expect(inputSchema.safeParse({ prompt: "x", addDirs: many }).success).toBe(false);
    expect(inputSchema.safeParse({ prompt: "x", addDirs: [""] }).success).toBe(false);
    expect(inputSchema.safeParse({ prompt: "x", addDirs: "/d" }).success).toBe(false);
  });

  it("passes resolved directories to execCodex and lists them in the header", async () => {
    const result = await handleCodexExec(
      { prompt: "x", mode: "full-auto", cwd: ws, addDirs: ["../lib", other], requireGit: false },
      ws,
    );

    expect(result.isError).toBeFalsy();
    expect(mockExecCodex.mock.calls[0]?.[0].addDirs).toEqual([other]);
    expect(result.content[0].text).toContain(`  add-dir (writable): ${other}`);
  });

  it("allows an explicit writable sandbox regardless of mode", async () => {
    for (const sandbox of ["workspace-write", "danger-full-access"] as const) {
      const result = await handleCodexExec({ prompt: "x", mode: "exec", sandbox, addDirs: [other], requireGit: false }, ws);
      expect(result.isError, sandbox).toBeFalsy();
    }
  });

  it("rejects addDirs under a read-only sandbox, where Codex ignores them", async () => {
    const byMode = await handleCodexExec({ prompt: "x", mode: "exec", addDirs: [other], requireGit: false }, ws);
    const explicit = await handleCodexExec(
      { prompt: "x", mode: "full-auto", sandbox: "read-only", addDirs: [other], requireGit: false },
      ws,
    );
    for (const r of [byMode, explicit]) {
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain("addDirs needs a writable sandbox");
    }
    expect(mockExecCodex).not.toHaveBeenCalled();
  });

  it("rejects addDirs with review or sessionId, which have no --add-dir", async () => {
    const review = await handleCodexExec({ mode: "full-auto", review: true, addDirs: [other], requireGit: false }, ws);
    const resume = await handleCodexExec(
      { prompt: "x", mode: "full-auto", sessionId: "s-1", addDirs: [other], requireGit: false },
      ws,
    );
    expect(review.content[0].text).toContain("addDirs is not supported with review");
    expect(resume.content[0].text).toContain("addDirs is not supported with sessionId");
    expect(mockExecCodex).not.toHaveBeenCalled();
  });

  it("rejects a missing directory with INVALID_ADD_DIR", async () => {
    const result = await handleCodexExec(
      { prompt: "x", mode: "full-auto", addDirs: ["../missing"], requireGit: false },
      ws,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("INVALID_ADD_DIR");
    expect(mockExecCodex).not.toHaveBeenCalled();
  });

  it("treats an empty list like no addDirs, even under read-only", async () => {
    const result = await handleCodexExec({ prompt: "x", mode: "exec", addDirs: [], requireGit: false }, ws);
    expect(result.isError).toBeFalsy();
    expect(mockExecCodex.mock.calls[0]?.[0].addDirs).toEqual([]);
    expect(result.content[0].text).not.toContain("add-dir");
  });
});
