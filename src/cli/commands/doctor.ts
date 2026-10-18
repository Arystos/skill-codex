import { runDoctor, type CheckResult, type CheckStatus } from "../../doctor/checks.js";
import type { CliCommand, CliIo } from "../registry.js";

// ASCII markers, matching `skill-codex verify` (safe on any Windows console code page).
const MARKERS: Record<CheckStatus, string> = { ok: "[ok]", warn: "[!!]", fail: "[xx]", skip: "[--]" };

export function renderDoctorReport(results: readonly CheckResult[]): string {
  const width = Math.max(...results.map((r) => r.name.length)) + 2;
  const lines = results.flatMap((r) => {
    const main = `${MARKERS[r.status]} ${r.name.padEnd(width)}${r.detail}`;
    return r.hint ? [main, `     ${" ".repeat(width)}-> ${r.hint}`] : [main];
  });
  const count = (s: CheckStatus): number => results.filter((r) => r.status === s).length;
  const summary = `${count("ok")} ok, ${count("warn")} warnings, ${count("fail")} failures`;
  return `skill-codex doctor\n\n${lines.join("\n")}\n\n${summary}\n`;
}

export function createDoctorCommand(run: typeof runDoctor = runDoctor): CliCommand {
  return {
    name: "doctor",
    args: "[--offline] [--json]",
    summary: "Diagnose the build, Codex CLI, auth, models, sandbox and install",
    async run(args: readonly string[], io: CliIo): Promise<number> {
      const results = await run({ offline: args.includes("--offline") });
      io.out(args.includes("--json") ? `${JSON.stringify(results, null, 2)}\n` : renderDoctorReport(results));
      return results.some((r) => r.status === "fail") ? 1 : 0;
    },
  };
}
