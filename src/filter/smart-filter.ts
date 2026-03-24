import path from "node:path";
import {
  TRIVIAL_DIFF_THRESHOLD,
  DOCS_ONLY_EXTENSIONS,
  SECURITY_PATH_KEYWORDS,
  FORCE_REVIEW_LINES,
  FORCE_REVIEW_FILES,
  CONFIG_ONLY_FILES,
} from "../config/constants.js";

export interface FilterResult {
  readonly review: boolean;
  readonly reason: string;
}

function countChangedLines(diff: string): number {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("+++") && !line.startsWith("---"))
    .length;
}

function isDocsOnly(files: readonly string[]): boolean {
  return files.every((f) => {
    const ext = path.extname(f).toLowerCase();
    return DOCS_ONLY_EXTENSIONS.includes(ext);
  });
}

function isConfigOnly(files: readonly string[]): boolean {
  return files.every((f) => {
    const basename = path.basename(f).toLowerCase();
    return CONFIG_ONLY_FILES.some((c) => basename === c || basename.startsWith(c));
  });
}

function isWhitespaceOnly(diff: string): boolean {
  const changedLines = diff
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("+++") && !line.startsWith("---"));

  if (changedLines.length === 0) return true;

  return changedLines.every((line) => {
    const content = line.slice(1); // remove +/- prefix
    return content.trim() === "";
  });
}

function isImportOnly(diff: string): boolean {
  const changedLines = diff
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("+++") && !line.startsWith("---"));

  if (changedLines.length === 0) return false;

  return changedLines.every((line) => {
    const content = line.slice(1).trim();
    return (
      content === "" ||
      content.startsWith("import ") ||
      content.startsWith("from ") ||
      content.startsWith("require(") ||
      content.startsWith("export {") ||
      content.startsWith("export default")
    );
  });
}

function containsSecurityPath(files: readonly string[]): boolean {
  return files.some((f) => {
    const lower = f.toLowerCase();
    return SECURITY_PATH_KEYWORDS.some((keyword) => lower.includes(keyword));
  });
}

export function shouldReview(
  diff: string,
  changedFiles: readonly string[],
): FilterResult {
  // Force review: security-sensitive paths
  if (containsSecurityPath(changedFiles)) {
    return { review: true, reason: "Security-sensitive file path detected" };
  }

  const linesChanged = countChangedLines(diff);

  // Force review: large changes
  if (linesChanged >= FORCE_REVIEW_LINES) {
    return { review: true, reason: `${linesChanged} lines changed (>= ${FORCE_REVIEW_LINES})` };
  }

  // Force review: many files
  if (changedFiles.length >= FORCE_REVIEW_FILES) {
    return { review: true, reason: `${changedFiles.length} files changed (>= ${FORCE_REVIEW_FILES})` };
  }

  // Skip: trivial diff
  if (linesChanged < TRIVIAL_DIFF_THRESHOLD) {
    return { review: false, reason: `Only ${linesChanged} lines changed (< ${TRIVIAL_DIFF_THRESHOLD})` };
  }

  // Skip: docs only
  if (isDocsOnly(changedFiles)) {
    return { review: false, reason: "Documentation-only changes" };
  }

  // Skip: config only
  if (isConfigOnly(changedFiles)) {
    return { review: false, reason: "Configuration-only changes" };
  }

  // Skip: whitespace only
  if (isWhitespaceOnly(diff)) {
    return { review: false, reason: "Whitespace-only changes" };
  }

  // Skip: import reordering only
  if (isImportOnly(diff)) {
    return { review: false, reason: "Import-only changes" };
  }

  // Default: skip (conservative — review is opt-in via /codex-review)
  return { review: false, reason: "Default: changes below force-review thresholds" };
}
