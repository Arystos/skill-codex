import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSetup, runUninstall } from "../setup/setup.js";
import { runVerification } from "../setup/verify.js";

const args = process.argv.slice(2);
const command = args[0];

function getVersion(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<void> {
  if (command === "--help" || command === "-h") {
    const version = getVersion();
    process.stdout.write(`skill-codex v${version}

Usage:
  skill-codex setup          Install MCP server, commands, and hook
  skill-codex setup --force  Overwrite existing configuration
  skill-codex verify         Check installation status
  skill-codex uninstall      Show uninstall instructions
  skill-codex --help, -h     Show this help message
  skill-codex --version, -v  Show version
`);
    process.exit(0);
    return;
  }

  if (command === "--version" || command === "-v") {
    process.stdout.write(`${getVersion()}\n`);
    process.exit(0);
    return;
  }

  switch (command) {
    case "setup": {
      const force = args.includes("--force");
      const success = await runSetup({ force });
      process.exit(success ? 0 : 1);
      break;
    }

    case "verify": {
      const { results, allPassed } = await runVerification();
      for (const check of results) {
        const icon = check.pass ? "[ok]" : "[!!]";
        process.stdout.write(`${icon} ${check.name}: ${check.detail}\n`);
      }
      process.exit(allPassed ? 0 : 1);
      break;
    }

    case "uninstall": {
      await runUninstall();
      break;
    }

    default: {
      const version = getVersion();
      process.stdout.write(`skill-codex v${version}

Usage:
  skill-codex setup          Install MCP server, commands, and hook
  skill-codex setup --force  Overwrite existing configuration
  skill-codex verify         Check installation status
  skill-codex uninstall      Show uninstall instructions
  skill-codex --help, -h     Show this help message
  skill-codex --version, -v  Show version
`);
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
