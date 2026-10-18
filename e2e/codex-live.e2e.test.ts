import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Drives the built server exactly as Claude Code does: a stdio MCP client
// calling `codex_exec`. Uses the developer's own `codex login`.
//
//   SKILL_CODEX_E2E_MODEL   model slug for every call (default: your config.toml default)
//   SKILL_CODEX_E2E_EFFORT  reasoning effort (default: low)

const DIST_ENTRY = path.resolve(__dirname, "..", "dist", "index.js");
const CALL_TIMEOUT_MS = 280_000;
const MODEL = process.env.SKILL_CODEX_E2E_MODEL || undefined;
const EFFORT = process.env.SKILL_CODEX_E2E_EFFORT || "low";

interface ToolResult {
  readonly isError?: boolean;
  readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
}

let client: Client;
let root: string;
let workspace: string;
let extraDir: string;
let sessionId: string | undefined;

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

async function call(args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const res = (await client.callTool(
    { name: "codex_exec", arguments: { cwd: workspace, reasoningEffort: EFFORT, ...(MODEL ? { model: MODEL } : {}), ...args } },
    undefined,
    { timeout: CALL_TIMEOUT_MS, resetTimeoutOnProgress: true },
  )) as ToolResult;
  const text = res.content.map((c) => c.text ?? "").join("\n");
  return { isError: res.isError ?? false, text };
}

beforeAll(async () => {
  if (!fs.existsSync(DIST_ENTRY)) {
    throw new Error(`${DIST_ENTRY} is missing: run \`npm run build\` first (npm run test:e2e does it for you)`);
  }

  root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-codex-e2e-"));
  workspace = path.join(root, "workspace");
  extraDir = path.join(root, "extra dir");
  fs.mkdirSync(workspace);
  fs.mkdirSync(extraDir);

  // A git repo with one commit and one uncommitted change, for the review test.
  fs.writeFileSync(path.join(workspace, "math.js"), "export function add(a, b) {\n  return a + b;\n}\n");
  git(workspace, "init", "-q");
  git(workspace, "-c", "user.name=e2e", "-c", "user.email=e2e@example.invalid", "add", ".");
  git(workspace, "-c", "user.name=e2e", "-c", "user.email=e2e@example.invalid", "commit", "-q", "-m", "init");
  fs.writeFileSync(path.join(workspace, "math.js"), "export function add(a, b) {\n  return a - b;\n}\n");

  const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
  const transport = new StdioClientTransport({ command: process.execPath, args: [DIST_ENTRY], env, stderr: "inherit" });
  client = new Client({ name: "skill-codex-e2e", version: "0" });
  await client.connect(transport);
});

afterAll(async () => {
  await client?.close();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe("codex_exec against the real Codex CLI", () => {
  it("advertises the tool and its parameters", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "codex_exec");
    expect(tool).toBeDefined();
    expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["prompt", "mode", "sessionId", "model", "review", "outputSchema", "addDirs"]),
    );
  });

  it("answers a read-only prompt and reports the session id", async () => {
    const res = await call({ prompt: "Reply with exactly the word pong and nothing else.", mode: "exec" });
    expect(res.isError, res.text).toBe(false);
    expect(res.text).toMatch(/pong/i);
    sessionId = /session: (\S+)/.exec(res.text)?.[1];
    expect(sessionId, res.text).toBeDefined();
  });

  it("resumes the session with sessionId", async () => {
    expect(sessionId, "needs the session from the previous test").toBeDefined();
    const res = await call({ prompt: "Repeat the exact word you replied with last time, and nothing else.", sessionId });
    expect(res.isError, res.text).toBe(false);
    expect(res.text).toMatch(/pong/i);
  });

  it("returns JSON constrained by outputSchema", async () => {
    const res = await call({
      prompt: "Put the word pong in the field `word`.",
      mode: "exec",
      outputSchema: {
        type: "object",
        properties: { word: { type: "string" } },
        required: ["word"],
        additionalProperties: false,
      },
    });
    expect(res.isError, res.text).toBe(false);
    expect(res.text).toContain("structured output: JSON constrained by outputSchema");
    expect(res.text).toMatch(/"word":\s*"pong"/i);
  });

  it("writes into an addDirs directory outside cwd", async () => {
    const target = path.join(extraDir, "e2e.txt");
    const res = await call({
      prompt: `Create the file ${target} with the content: ok\nDo not create or change any other file.`,
      mode: "full-auto",
      addDirs: [extraDir],
    });
    expect(res.isError, res.text).toBe(false);
    expect(res.text).toContain("add-dir (writable):");
    expect(fs.existsSync(target), res.text).toBe(true);
  });

  it("reviews uncommitted changes with the native review", async () => {
    const res = await call({ review: true });
    expect(res.isError, res.text).toBe(false);
    expect(res.text.trim().length).toBeGreaterThan(0);
  });

  it("falls back to the default model when the model is rejected", async () => {
    const res = await call({ prompt: "Reply with exactly the word pong.", mode: "exec", model: "skill-codex-e2e-no-such-model" });
    expect(res.isError, res.text).toBe(false);
    expect(res.text).toContain("was rejected");
    expect(res.text).toMatch(/pong/i);
  });
});
