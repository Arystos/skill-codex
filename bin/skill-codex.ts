import { runSetup, runUninstall } from "../setup/setup.js";
import { runVerification } from "../setup/verify.js";
import { startServer } from "../src/server.js";
import { getVersion } from "../src/config/version.js";
import { dispatch, type CliCommand } from "../src/cli/registry.js";
import { createDoctorCommand } from "../src/cli/commands/doctor.js";

// Subcommands. Add a new one by appending a CliCommand here (see src/cli/registry.ts).
const COMMANDS: readonly CliCommand[] = [
  {
    name: "setup",
    args: "[--force]",
    summary: "Install MCP server, commands, and hook (--force overwrites)",
    async run(args) {
      return (await runSetup({ force: args.includes("--force") })) ? 0 : 1;
    },
  },
  {
    name: "verify",
    summary: "Check installation status",
    async run(_args, io) {
      const { results, allPassed } = await runVerification();
      for (const check of results) {
        io.out(`${check.pass ? "[ok]" : "[!!]"} ${check.name}: ${check.detail}\n`);
      }
      return allPassed ? 0 : 1;
    },
  },
  createDoctorCommand(),
  {
    name: "uninstall",
    summary: "Show uninstall instructions",
    async run() {
      await runUninstall();
      return 0;
    },
  },
  {
    name: "mcp",
    aliases: ["serve"],
    summary: "Start the MCP server over stdio (used by the plugin)",
    async run() {
      // Used by the Claude Code plugin's .mcp.json via `npx -y skill-codex mcp`.
      // Must NOT write to stdout (that's the JSON-RPC channel) or exit — the
      // process stays alive for the stdio transport.
      await startServer();
      return null;
    },
  },
];

dispatch(process.argv.slice(2), COMMANDS, getVersion())
  .then((code) => {
    if (code !== null) process.exit(code);
  })
  .catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
