import { describe, it, expect, vi } from "vitest";
import { createDoctorCommand, renderDoctorReport } from "../../src/cli/commands/doctor.js";
import type { CheckResult } from "../../src/doctor/checks.js";

const RESULTS: CheckResult[] = [
  { name: "codex", status: "ok", detail: "codex-cli 0.163.0" },
  { name: "install", status: "fail", detail: "not registered", hint: "run setup" },
  { name: "auth", status: "skip", detail: "skipped" },
  { name: "update", status: "warn", detail: "0.9.0 available" },
];

function io() {
  const captured = { stdout: "", out: (t: string) => void (captured.stdout += t), err: vi.fn() };
  return captured;
}

describe("renderDoctorReport", () => {
  it("aligns names, shows hints and a summary", () => {
    const report = renderDoctorReport(RESULTS);
    expect(report).toContain("[ok] codex    codex-cli 0.163.0");
    expect(report).toContain("[xx] install  not registered");
    expect(report).toContain("-> run setup");
    expect(report).toContain("[--] auth");
    expect(report).toContain("[!!] update");
    expect(report).toContain("1 ok, 1 warnings, 1 failures");
  });
});

describe("doctor command", () => {
  it("exits 1 when any check fails and passes --offline through", async () => {
    const run = vi.fn().mockResolvedValue(RESULTS);
    const out = io();
    expect(await createDoctorCommand(run).run(["--offline"], out)).toBe(1);
    expect(run).toHaveBeenCalledWith({ offline: true });
    expect(out.stdout).toContain("skill-codex doctor");
  });

  it("prints JSON and exits 0 without failures", async () => {
    const run = vi.fn().mockResolvedValue([RESULTS[0]]);
    const out = io();
    expect(await createDoctorCommand(run).run(["--json"], out)).toBe(0);
    expect(JSON.parse(out.stdout)).toEqual([RESULTS[0]]);
  });
});
