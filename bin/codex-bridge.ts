import { runSetup, runUninstall } from "../setup/setup.js";
import { runVerification } from "../setup/verify.js";

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
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
      process.stdout.write(`codex-bridge v0.1.0

Usage:
  codex-bridge setup      Install MCP server, commands, and hook
  codex-bridge setup --force  Overwrite existing configuration
  codex-bridge verify     Check installation status
  codex-bridge uninstall  Show uninstall instructions
`);
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
