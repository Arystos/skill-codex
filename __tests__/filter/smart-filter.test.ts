import { describe, it, expect } from "vitest";
import { shouldReview } from "../../src/filter/smart-filter.js";

describe("shouldReview", () => {
  it("forces review for security-sensitive paths", () => {
    const diff = "+const x = 1;";
    const result = shouldReview(diff, ["src/auth/login.ts"]);
    expect(result.review).toBe(true);
    expect(result.reason).toContain("Security");
  });

  it("forces review for many lines changed", () => {
    const lines = Array.from({ length: 110 }, (_, i) => `+line ${i}`).join("\n");
    const result = shouldReview(lines, ["src/app.ts"]);
    expect(result.review).toBe(true);
    expect(result.reason).toContain("lines changed");
  });

  it("forces review for many files changed", () => {
    const diff = "+a\n+b\n+c\n+d\n+e\n+f";
    const result = shouldReview(diff, ["a.ts", "b.ts", "c.ts"]);
    expect(result.review).toBe(true);
    expect(result.reason).toContain("files changed");
  });

  it("skips trivial diffs", () => {
    const diff = "+x\n-y";
    const result = shouldReview(diff, ["src/app.ts"]);
    expect(result.review).toBe(false);
    expect(result.reason).toContain("lines changed");
  });

  it("skips docs-only changes", () => {
    const diff = "+new line\n+another\n+third\n+fourth\n+fifth\n+sixth";
    const result = shouldReview(diff, ["README.md", "docs/guide.txt"]);
    expect(result.review).toBe(false);
    expect(result.reason).toContain("Documentation");
  });

  it("skips whitespace-only changes", () => {
    const diff = "+  \n-\n+   \n-  \n+\n-";
    const result = shouldReview(diff, ["src/app.ts"]);
    expect(result.review).toBe(false);
    expect(result.reason).toContain("Whitespace");
  });

  it("skips import-only changes", () => {
    const diff = [
      '+import { foo } from "bar";',
      '-import { baz } from "qux";',
      '+import { alpha } from "beta";',
      '-import { gamma } from "delta";',
      '+from typing import List',
    ].join("\n");
    const result = shouldReview(diff, ["src/app.ts"]);
    expect(result.review).toBe(false);
    expect(result.reason).toContain("Import");
  });

  it("skips config-only changes", () => {
    const diff = "+*.log\n+node_modules/\n+dist/\n+coverage/\n+temp/\n+cache/";
    const result = shouldReview(diff, [".gitignore"]);
    expect(result.review).toBe(false);
    expect(result.reason).toContain("Configuration");
  });

  it("security paths override trivial threshold", () => {
    const diff = "+x";
    const result = shouldReview(diff, ["src/crypto/hash.ts"]);
    expect(result.review).toBe(true);
  });
});
