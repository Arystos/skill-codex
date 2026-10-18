/** Output channels, injected so commands are testable without touching process streams. */
export interface CliIo {
  out(text: string): void;
  err(text: string): void;
}

export interface CliCommand {
  readonly name: string;
  readonly aliases?: readonly string[];
  /** Arguments shown after the name in help, e.g. "[--offline] [--json]". */
  readonly args?: string;
  readonly summary: string;
  /** Exit code, or null for a long-running command (the MCP server) that must keep the process alive. */
  run(args: readonly string[], io: CliIo): Promise<number | null>;
}

export const processIo: CliIo = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

export function renderHelp(commands: readonly CliCommand[], version: string): string {
  const rows = commands.map((c) => [`skill-codex ${c.name}${c.args ? ` ${c.args}` : ""}`, c.summary] as const);
  rows.push(["skill-codex --help, -h", "Show this help message"], ["skill-codex --version, -v", "Show version"]);
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 2;
  const lines = rows.map(([usage, summary]) => `  ${usage.padEnd(width)}${summary}`);
  return `skill-codex v${version}\n\nUsage:\n${lines.join("\n")}\n`;
}

function findCommand(commands: readonly CliCommand[], name: string): CliCommand | undefined {
  return commands.find((c) => c.name === name || c.aliases?.includes(name));
}

/** Route argv (without node and script) to a command. Returns the exit code, or null to keep running. */
export async function dispatch(
  argv: readonly string[],
  commands: readonly CliCommand[],
  version: string,
  io: CliIo = processIo,
): Promise<number | null> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h") {
    io.out(renderHelp(commands, version));
    return 0;
  }
  if (name === "--version" || name === "-v") {
    io.out(`${version}\n`);
    return 0;
  }

  const command = findCommand(commands, name);
  if (!command) {
    io.err(`Unknown command: ${name}\n\n`);
    io.out(renderHelp(commands, version));
    return 1;
  }
  return command.run(rest, io);
}
