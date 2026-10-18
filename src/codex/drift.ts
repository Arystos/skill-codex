import { EXEC_EVENTS_SCHEMA_PATH, REQUIRED_FLAGS, VERIFIED_CODEX_VERSION } from "../config/codex-contract.js";
import { runCodexCommand } from "./cli.js";
import { checkContract, formatContractReport, type ContractResult } from "./contract-check.js";
import { codexVersionNotice, parseCodexVersion } from "./version-check.js";

/** ok = nothing to do; outdated = new Codex minor, contract intact; drift = contract broken. */
export type DriftStatus = "ok" | "outdated" | "drift";

export interface DriftReport {
  readonly status: DriftStatus;
  readonly version: string;
  readonly markdown: string;
}

type FetchText = (url: string) => Promise<string>;

export function schemaUrl(version: string): string {
  return `https://raw.githubusercontent.com/openai/codex/rust-v${version}/${EXEC_EVENTS_SCHEMA_PATH}`;
}

export function decideStatus(result: ContractResult, installed: string, verified: string = VERIFIED_CODEX_VERSION): DriftStatus {
  if (!result.ok) return "drift";
  return codexVersionNotice(installed, verified) ? "outdated" : "ok";
}

async function defaultFetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed with HTTP ${res.status}`);
  return res.text();
}

async function collectHelp(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.keys(REQUIRED_FLAGS).map(async (command) => {
      const result = await runCodexCommand([...command.split(" "), "--help"]);
      return [command, result.ok ? result.stdout : ""] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Check the installed Codex against what skill-codex relies on. Throws if Codex can't be run. */
export async function runDriftCheck(fetchText: FetchText = defaultFetchText): Promise<DriftReport> {
  const versionResult = await runCodexCommand(["--version"]);
  const version = versionResult.ok ? parseCodexVersion(versionResult.stdout) : null;
  if (!version) throw new Error(`Could not read the codex version: ${versionResult.stderr.trim() || "no output"}`);

  const [help, schemaSource] = await Promise.all([collectHelp(), fetchText(schemaUrl(version))]);
  const result = checkContract({ help, schemaSource });
  const status = decideStatus(result, version);
  const header =
    status === "outdated"
      ? `codex-cli ${version} is newer than the verified ${VERIFIED_CODEX_VERSION}. The contract holds; re-verify live and bump VERIFIED_CODEX_VERSION.\n\n`
      : "";
  return { status, version, markdown: header + formatContractReport(result, version) };
}
