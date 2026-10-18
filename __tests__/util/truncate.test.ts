import { describe, it, expect } from "vitest";
import { truncateResponse } from "../../src/util/truncate.js";

describe("truncateResponse", () => {
  it("returns text unchanged if under limit", () => {
    expect(truncateResponse("hello", 100)).toBe("hello");
  });

  it("truncates text exceeding limit", () => {
    const result = truncateResponse("abcdefghij", 5);
    expect(result).toContain("abcde");
    expect(result).toContain("truncated");
    expect(result).toContain("5 characters omitted");
  });

  it("returns exact text at limit boundary", () => {
    expect(truncateResponse("12345", 5)).toBe("12345");
  });
});

describe("truncateResponse with a saved full output", () => {
  it("names the file holding the full text", () => {
    expect(truncateResponse("abcdefghij", 5, "/tmp/full.md")).toContain("5 characters omitted. Full output: /tmp/full.md]");
  });
});
