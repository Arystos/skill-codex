import { PARSED_EVENT_TYPES, PARSED_ITEM_TYPES, REQUIRED_FLAGS } from "../config/codex-contract.js";

export interface ContractRequirements {
  readonly flags: Readonly<Record<string, readonly string[]>>;
  readonly events: readonly string[];
  readonly items: readonly string[];
}

export interface ContractInput {
  /** `--help` output per subcommand key (e.g. "exec", "exec review"). */
  readonly help: Readonly<Record<string, string>>;
  /** Source of codex-rs/exec/src/exec_events.rs. */
  readonly schemaSource: string;
}

export interface ContractResult {
  readonly ok: boolean;
  readonly missingFlags: string[];
  readonly missingEvents: string[];
  readonly missingItems: string[];
  /** Item types Codex can emit that skill-codex ignores — informational only. */
  readonly unhandledItems: string[];
}

export const DEFAULT_REQUIREMENTS: ContractRequirements = {
  flags: REQUIRED_FLAGS,
  events: PARSED_EVENT_TYPES,
  items: PARSED_ITEM_TYPES,
};

/** Flags from clap `--help` output: option lines start with `-x, --long` or `--long`. */
export function parseHelpFlags(helpText: string): Set<string> {
  const flags = new Set<string>();
  for (const line of helpText.split(/\r?\n/)) {
    const match = line.match(/^\s+(?:(-[A-Za-z]),\s+)?(--[A-Za-z0-9][\w-]*)/);
    if (!match) continue;
    if (match[1]) flags.add(match[1]);
    if (match[2]) flags.add(match[2]);
  }
  return flags;
}

function toSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Serde tags of a Rust enum's variants: an explicit `#[serde(rename = "...")]`
 * wins, otherwise the variant name in snake_case (the schema's rename_all).
 */
export function extractEnumTags(source: string, enumName: string): string[] {
  const start = source.indexOf(`pub enum ${enumName} {`);
  if (start < 0) return [];
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end < 0 ? undefined : end).split(/\r?\n/).slice(1);

  const tags: string[] = [];
  let pendingRename: string | null = null;
  for (const line of body) {
    const rename = line.match(/#\[serde\(rename\s*=\s*"([^"]+)"\)\]/);
    if (rename?.[1]) {
      pendingRename = rename[1];
      continue;
    }
    const variant = line.match(/^\s*([A-Z]\w*)\s*[({,]/);
    if (variant?.[1]) {
      tags.push(pendingRename ?? toSnakeCase(variant[1]));
      pendingRename = null;
    }
  }
  return tags;
}

export function checkContract(
  input: ContractInput,
  required: ContractRequirements = DEFAULT_REQUIREMENTS,
): ContractResult {
  const missingFlags = Object.entries(required.flags).flatMap(([command, flags]) => {
    const available = parseHelpFlags(input.help[command] ?? "");
    return flags.filter((f) => !available.has(f)).map((f) => `${command}: ${f}`);
  });
  const events = new Set(extractEnumTags(input.schemaSource, "ThreadEvent"));
  const itemList = extractEnumTags(input.schemaSource, "ThreadItemDetails");
  const items = new Set(itemList);

  const missingEvents = required.events.filter((e) => !events.has(e));
  const missingItems = required.items.filter((i) => !items.has(i));
  const unhandledItems = itemList.filter((i) => !required.items.includes(i));

  return {
    ok: missingFlags.length === 0 && missingEvents.length === 0 && missingItems.length === 0,
    missingFlags,
    missingEvents,
    missingItems,
    unhandledItems,
  };
}

function section(title: string, entries: readonly string[]): string[] {
  return entries.length === 0 ? [] : [`### ${title}`, ...entries.map((e) => `- ${e}`), ""];
}

export function formatContractReport(result: ContractResult, codexVersion: string): string {
  const summary = result.ok
    ? "All flags and event types skill-codex relies on are present."
    : "**Breaking drift:** skill-codex relies on flags or event types that are missing.";
  return [
    `## Codex contract check — codex-cli ${codexVersion}`,
    "",
    summary,
    "",
    ...section("Missing flags", result.missingFlags),
    ...section("Missing event types", result.missingEvents),
    ...section("Missing item types", result.missingItems),
    ...section("Item types Codex emits that skill-codex ignores (informational)", result.unhandledItems),
  ].join("\n");
}
