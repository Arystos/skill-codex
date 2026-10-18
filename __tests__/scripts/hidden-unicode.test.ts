import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findHiddenUnicode,
  formatFinding,
  isBinaryPath,
  regularFilesFromLsTree,
  splitNul,
} from "../../scripts/check-hidden-unicode.mjs";

const SCANNER = path.resolve("scripts/check-hidden-unicode.mjs");

// Built at runtime so this file contains no hidden characters itself
// (the scanner runs on every PR, including on this test).
const ch = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const RLO = ch(0x202e);
const LRI = ch(0x2066);
const PDI = ch(0x2069);
const ZWSP = ch(0x200b);
const BOM = ch(0xfeff);
const ZWJ = ch(0x200d);

describe("findHiddenUnicode", () => {
  it("finds bidi controls (Trojan Source) with line and column", () => {
    const text = `const ok = 1;\nif (role !== "user${RLO} ${LRI}// admin${PDI}") {}`;
    expect(findHiddenUnicode(text)).toEqual([
      { line: 2, column: 19, codePoint: "U+202E", name: "bidi control" },
      { line: 2, column: 21, codePoint: "U+2066", name: "bidi control" },
      { line: 2, column: 30, codePoint: "U+2069", name: "bidi control" },
    ]);
  });

  it("finds invisible tag characters that can smuggle instructions to an agent", () => {
    const findings = findHiddenUnicode(`Review the diff.${ch(0xe0072, 0xe0075, 0xe006e)}\n`);
    expect(findings.map((f) => f.codePoint)).toEqual(["U+E0072", "U+E0075", "U+E006E"]);
    expect(findings[0]?.name).toBe("tag character");
  });

  it("finds zero-width spaces and a BOM that is not at the start", () => {
    expect(findHiddenUnicode(`a${ZWSP}b`).map((f) => f.name)).toEqual(["zero-width character"]);
    expect(findHiddenUnicode(`x${BOM}y`).map((f) => f.name)).toEqual(["zero-width character"]);
  });

  it("allows a leading BOM, emoji joiners and ordinary text", () => {
    expect(findHiddenUnicode(`${BOM}hello`)).toEqual([]);
    expect(findHiddenUnicode(`family ${ch(0x1f468)}${ZWJ}${ch(0x1f469)} · café — ✓`)).toEqual([]);
  });
});

describe("formatFinding", () => {
  it("renders a GitHub Actions error annotation", () => {
    expect(formatFinding("src/a.ts", { line: 2, column: 5, codePoint: "U+202E", name: "bidi control" })).toBe(
      "::error file=src/a.ts,line=2,col=5::Hidden Unicode U+202E (bidi control)",
    );
  });
});

describe("NUL bytes", () => {
  it("reports a NUL inside a text file", () => {
    expect(findHiddenUnicode(`ok${ch(0)}`).map((f) => f.name)).toEqual(["NUL byte in a text file"]);
  });
});

describe("git helpers", () => {
  it("treats only known binary extensions as binary", () => {
    expect(isBinaryPath("docs/demo.GIF")).toBe(true);
    expect(isBinaryPath("commands/codex-do.md")).toBe(false);
    expect(isBinaryPath("Makefile")).toBe(false);
  });

  it("splits NUL-separated paths, keeping spaces and newlines in names", () => {
    expect(splitNul(`a b.md${ch(0)}odd\nname.md${ch(0)}`)).toEqual(["a b.md", "odd\nname.md"]);
  });

  it("keeps regular files and drops symlinks and submodules from ls-tree output", () => {
    const entries = [
      "100644 blob 1111111111111111111111111111111111111111\tsrc/a.ts",
      "100755 blob 2222222222222222222222222222222222222222\tbin/run",
      "120000 blob 3333333333333333333333333333333333333333\tlink-to-etc",
      "160000 commit 4444444444444444444444444444444444444444\tvendor/sub",
    ];
    expect(regularFilesFromLsTree(entries.join(ch(0)) + ch(0))).toEqual(["src/a.ts", "bin/run"]);
  });
});

describe("--diff mode (end to end)", () => {
  it("scans changed text files from git objects and skips symlinks and binaries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-unicode-"));
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "core.autocrlf=false", ...args], {
        cwd: dir,
        encoding: "utf8",
      });
    try {
      git("init", "-q");
      fs.writeFileSync(path.join(dir, "base.md"), "base\n");
      git("add", ".");
      git("commit", "-qm", "base");
      const base = git("rev-parse", "HEAD").trim();

      fs.writeFileSync(path.join(dir, "clean.md"), "all good\n");
      fs.writeFileSync(path.join(dir, "evil.md"), `Review.${ch(0xe0072)}\n`);
      fs.writeFileSync(path.join(dir, "with-nul.md"), `hidden${ch(0)}${ch(0xe0072)}\n`);
      fs.writeFileSync(path.join(dir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xf3, 0xa0, 0x81, 0xb2]));
      git("add", ".");
      // A symlink entry (mode 120000) whose target text holds a tag character.
      const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: dir, input: `x${ch(0xe0072)}` })
        .toString()
        .trim();
      git("update-index", "--add", "--cacheinfo", `120000,${blob},link.md`);
      git("commit", "-qm", "change");

      const result = spawnSync(process.execPath, [SCANNER, "--diff", base, "HEAD"], { cwd: dir, encoding: "utf8" });
      expect(result.status).toBe(1);
      const flagged = result.stdout.split("\n").filter((l) => l.startsWith("::error")).map((l) => l.split(",")[0]);
      expect(flagged).toEqual(["::error file=evil.md", "::error file=with-nul.md", "::error file=with-nul.md"]);
      expect(result.stdout).toContain("Scanned 3 files");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
