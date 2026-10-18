// Fails when a file contains hidden Unicode. Bidi controls can reorder code so
// a reviewer reads something different from what runs ("Trojan Source",
// CVE-2021-42574). Unicode tag characters (U+E0000–U+E007F) can carry
// invisible instructions for an AI agent reading commands or skills.
// Zero-width joiners (U+200C/U+200D) are allowed: emoji use them.
//
// Plain JavaScript with no dependencies on purpose: the PR-safety workflow
// runs the base branch's copy, without `npm ci`, so a pull request can't
// weaken the check it is being checked by.
//
// Usage:
//   node scripts/check-hidden-unicode.mjs [files...]      scan files on disk
//                                                          (no args: every tracked file)
//   node scripts/check-hidden-unicode.mjs --diff <base> <head>
//       scan the files changed between two commits, read straight from git
//       objects: nothing is checked out, symlinks and submodules are skipped,
//       and NUL-separated paths keep odd file names intact.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const MAX_BLOB_BYTES = 50 * 1024 * 1024;
// Skipped as binary by extension only. Any other file with a NUL byte is
// reported, so a NUL can't be used to hide a text file from the scan.
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".mp4", ".webm", ".mov",
  ".woff", ".woff2", ".ttf", ".otf", ".pdf", ".zip", ".gz", ".tgz", ".wasm",
]);

function classify(cp) {
  if ((cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0x200e || cp === 0x200f) {
    return "bidi control";
  }
  if (cp >= 0xe0000 && cp <= 0xe007f) return "tag character";
  if (cp === 0x200b || cp === 0x2060 || cp === 0xfeff) return "zero-width character";
  if (cp === 0) return "NUL byte in a text file";
  return null;
}

/** Every hidden character in `text`, with 1-based line/column. A BOM at the very start is allowed. */
export function findHiddenUnicode(text) {
  const findings = [];
  let line = 1;
  let column = 0;
  let offset = 0;
  for (const char of text) {
    column += 1;
    const cp = char.codePointAt(0) ?? 0;
    if (char === "\n") {
      line += 1;
      column = 0;
    } else {
      const name = offset === 0 && cp === 0xfeff ? null : classify(cp);
      if (name) {
        findings.push({ line, column, codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, name });
      }
    }
    offset += char.length;
  }
  return findings;
}

/** A GitHub Actions error annotation, so the finding shows on the PR diff. */
export function formatFinding(file, f) {
  return `::error file=${file},line=${f.line},col=${f.column}::Hidden Unicode ${f.codePoint} (${f.name})`;
}

export function isBinaryPath(file) {
  const dot = file.lastIndexOf(".");
  return dot >= 0 && BINARY_EXTENSIONS.has(file.slice(dot).toLowerCase());
}

/** Paths from NUL-separated git output (`-z`). */
export function splitNul(output) {
  return output.split("\0").filter(Boolean);
}

/** Regular files (mode 100644/100755) from `git ls-tree -z` output; drops symlinks and submodules. */
export function regularFilesFromLsTree(output) {
  return splitNul(output)
    .map((entry) => entry.match(/^(\d+) \w+ [0-9a-f]+\t(.*)$/s))
    .filter((m) => m !== null && (m[1] === "100644" || m[1] === "100755"))
    .map((m) => m[2]);
}

function git(args, encoding = "utf8") {
  return execFileSync("git", args, { encoding, maxBuffer: MAX_BLOB_BYTES });
}

/** [path, text] pairs for files changed between two commits, read from git objects. */
function changedBlobs(base, head) {
  const changed = splitNul(git(["diff", "--name-only", "-z", "--no-renames", "--diff-filter=d", `${base}...${head}`]));
  if (changed.length === 0) return [];
  const regular = new Set(regularFilesFromLsTree(git(["ls-tree", "-z", head, "--", ...changed])));
  return changed
    .filter((file) => regular.has(file) && !isBinaryPath(file))
    .map((file) => [file, git(["cat-file", "blob", `${head}:${file}`], "buffer").toString("utf8")]);
}

function filesOnDisk(args) {
  const files = args.length > 0 ? args : splitNul(git(["ls-files", "-z"]));
  return files
    .filter((file) => !isBinaryPath(file))
    .flatMap((file) => {
      try {
        if (!fs.lstatSync(file).isFile()) return []; // symlink, directory, device…
        return [[file, fs.readFileSync(file, "utf8")]];
      } catch {
        return []; // deleted, or unreadable
      }
    });
}

function main(args) {
  const entries = args[0] === "--diff" ? changedBlobs(args[1], args[2]) : filesOnDisk(args);
  let total = 0;
  for (const [file, text] of entries) {
    for (const finding of findHiddenUnicode(text)) {
      process.stdout.write(`${formatFinding(file, finding)}\n`);
      total += 1;
    }
  }
  process.stdout.write(`Scanned ${entries.length} files: ${total} hidden Unicode characters.\n`);
  return total > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
