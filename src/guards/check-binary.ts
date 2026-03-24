import which from "which";
import { CliNotFoundError } from "../errors/errors.js";

export interface BinaryCheckResult {
  readonly found: boolean;
  readonly path: string | null;
}

export async function checkBinary(
  binary: string = "codex",
): Promise<BinaryCheckResult> {
  try {
    const resolved = await which(binary);
    return { found: true, path: resolved };
  } catch {
    throw new CliNotFoundError(binary);
  }
}
