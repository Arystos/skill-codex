import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectInstall, isDisabledFor } from "../../src/install/detect.js";

describe("detectInstall", () => {
  let dir: string;
  let claudeJson: string;
  let pluginsFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-detect-"));
    claudeJson = path.join(dir, ".claude.json");
    pluginsFile = path.join(dir, "installed_plugins.json");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports nothing when no config files exist", () => {
    expect(detectInstall(claudeJson, pluginsFile, dir)).toEqual({
      setupServer: null,
      pluginIds: [],
      disabledInProjects: [],
      projectScopes: [],
    });
  });

  it("finds local-scope and project .mcp.json registrations for the directory", () => {
    const project = path.join(dir, "proj");
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, ".mcp.json"), JSON.stringify({ mcpServers: { "skill-codex": { command: "npx" } } }));
    fs.writeFileSync(
      claudeJson,
      JSON.stringify({ projects: { [project.split(path.sep).join("/")]: { mcpServers: { "skill-codex": { command: "node" } } } } }),
    );
    expect(detectInstall(claudeJson, pluginsFile, project).projectScopes).toEqual(["local", "project"]);
  });

  it("finds a setup registration, plugin installs and disabled projects", () => {
    fs.writeFileSync(
      claudeJson,
      JSON.stringify({
        mcpServers: { "skill-codex": { command: "node", args: ["/x/dist/index.js", 3] } },
        projects: {
          "D:/Work/a": { disabledMcpServers: ["skill-codex"] },
          "D:/Work/b": { disabledMcpServers: ["other"] },
          "D:/Work/c": {},
        },
      }),
    );
    fs.writeFileSync(
      pluginsFile,
      JSON.stringify({ plugins: { "skill-codex@skill-codex": [{}], "context7@official": [{}] } }),
    );

    expect(detectInstall(claudeJson, pluginsFile, dir)).toEqual({
      setupServer: { command: "node", args: ["/x/dist/index.js"] },
      pluginIds: ["skill-codex@skill-codex"],
      disabledInProjects: ["D:/Work/a"],
      projectScopes: [],
    });
  });

  it("tolerates malformed files", () => {
    fs.writeFileSync(claudeJson, "{not json");
    fs.writeFileSync(pluginsFile, JSON.stringify({ plugins: "nope" }));
    expect(detectInstall(claudeJson, pluginsFile, dir).pluginIds).toEqual([]);
  });
});

describe("isDisabledFor", () => {
  const state = { setupServer: null, pluginIds: [], disabledInProjects: [path.resolve("/work/a")], projectScopes: [] };

  it("matches the project and its subdirectories only", () => {
    expect(isDisabledFor(state, "/work/a")).toBe(true);
    expect(isDisabledFor(state, "/work/a/src")).toBe(true);
    expect(isDisabledFor(state, "/work/ab")).toBe(false);
    expect(isDisabledFor(state, "/work")).toBe(false);
  });
});
