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
