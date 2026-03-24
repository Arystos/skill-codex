import { BRIDGE_DEPTH_ENV, MAX_BRIDGE_DEPTH } from "../config/constants.js";
import { RecursionLimitError } from "../errors/errors.js";

export function getCurrentDepth(): number {
  return parseInt(process.env[BRIDGE_DEPTH_ENV] ?? "0", 10);
}

export function getNextDepth(): number {
  return getCurrentDepth() + 1;
}

export function checkRecursion(): void {
  const depth = getCurrentDepth();
  if (depth >= MAX_BRIDGE_DEPTH) {
    throw new RecursionLimitError(depth, MAX_BRIDGE_DEPTH);
  }
}
