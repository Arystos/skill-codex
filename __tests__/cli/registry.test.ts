import { describe, it, expect, vi } from "vitest";
import { dispatch, renderHelp, type CliCommand, type CliIo } from "../../src/cli/registry.js";

function captureIo(): CliIo & { stdout: string; stderr: string } {
  const io = {
    stdout: "",
    stderr: "",
    out(text: string) {
      io.stdout += text;
    },
    err(text: string) {
      io.stderr += text;
    },
  };
  return io;
}

const doctor: CliCommand = {
  name: "doctor",
  args: "[--offline]",
  summary: "Diagnose the installation",
  run: vi.fn().mockResolvedValue(0),
};
const serve: CliCommand = { name: "mcp", aliases: ["serve"], summary: "Start the MCP server", run: vi.fn().mockResolvedValue(null) };
const COMMANDS = [doctor, serve];

describe("renderHelp", () => {
  it("lists every command with its args and the global flags", () => {
    const help = renderHelp(COMMANDS, "1.2.3");
    expect(help).toContain("skill-codex v1.2.3");
    expect(help).toMatch(/skill-codex doctor \[--offline\]\s+Diagnose the installation/);
    expect(help).toMatch(/skill-codex mcp\s+Start the MCP server/);
    expect(help).toContain("skill-codex --version, -v");
  });
});

describe("dispatch", () => {
  it("prints help for no args and --help", async () => {
    for (const argv of [[], ["--help"], ["-h"]]) {
      const io = captureIo();
      expect(await dispatch(argv, COMMANDS, "1.0.0", io)).toBe(0);
      expect(io.stdout).toContain("Usage:");
    }
  });

  it("prints the version", async () => {
    const io = captureIo();
    expect(await dispatch(["-v"], COMMANDS, "1.0.0", io)).toBe(0);
    expect(io.stdout).toBe("1.0.0\n");
  });

  it("runs a command by name or alias and passes the remaining args", async () => {
    const io = captureIo();
    expect(await dispatch(["doctor", "--offline"], COMMANDS, "1.0.0", io)).toBe(0);
    expect(doctor.run).toHaveBeenCalledWith(["--offline"], io);
    expect(await dispatch(["serve"], COMMANDS, "1.0.0", io)).toBeNull();
  });

  it("rejects unknown commands with exit code 1", async () => {
    const io = captureIo();
    expect(await dispatch(["nope"], COMMANDS, "1.0.0", io)).toBe(1);
    expect(io.stderr).toContain("Unknown command: nope");
    expect(io.stdout).toContain("Usage:");
  });
});
