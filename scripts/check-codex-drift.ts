// Scheduled Codex drift check (see .github/workflows/codex-drift.yml).
// Compares the installed codex-cli against src/config/codex-contract.ts and
// writes a markdown report. Exit code is 0 whenever the check itself ran; the
// verdict goes to $GITHUB_OUTPUT as `status` (ok | outdated | drift) so the
// workflow can open an issue. Run locally with: npx vite-node scripts/check-codex-drift.ts
import fs from "node:fs";
import { runDriftCheck } from "../src/codex/drift.js";

const REPORT_PATH = process.argv[2] ?? "codex-drift-report.md";

async function main(): Promise<void> {
  const report = await runDriftCheck();
  fs.writeFileSync(REPORT_PATH, report.markdown + "\n", "utf-8");
  process.stdout.write(`${report.markdown}\n\nstatus: ${report.status}\n`);

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `status=${report.status}\nversion=${report.version}\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Codex drift check failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
