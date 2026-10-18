import { describe, it, expect } from "vitest";
import { isShellSafePath, toPathArg } from "../../src/runner/path-arg.js";
import { BridgeError } from "../../src/errors/errors.js";

describe("isShellSafePath", () => {
  it("accepts ordinary absolute paths, including spaces and non-ASCII letters", () => {
    expect(isShellSafePath("C:\\Users\\John Smith\\AppData\\Local\\Temp")).toBe(true);
    expect(isShellSafePath("/home/josé/repo/packages/api")).toBe(true);
    expect(isShellSafePath("D:\\work\\mono (copy)\\pkg-a_1.2")).toBe(true);
  });

  it("rejects characters cmd.exe interprets, even inside quotes", () => {
    for (const bad of ["C:\\a%PATH%b", 'C:\\a"b', "C:\\a&calc", "C:\\a|b", "C:\\a^b", "C:\\a<b", "C:\\a>b", "/a;b", "/a!b", "/a$b", "/a`b"]) {
      expect(isShellSafePath(bad), bad).toBe(false);
    }
  });

  it("rejects control characters and the empty string", () => {
    expect(isShellSafePath("/a\nb")).toBe(false);
    expect(isShellSafePath("/a\tb")).toBe(false);
    expect(isShellSafePath("")).toBe(false);
  });
});

describe("toPathArg", () => {
  it("passes the path unchanged outside Windows (spawn uses no shell there)", () => {
    expect(toPathArg("/home/me/my repo", "linux")).toBe("/home/me/my repo");
    expect(toPathArg("/Users/me/repo", "darwin")).toBe("/Users/me/repo");
  });

  it("double-quotes the path on Windows so spaces survive cmd.exe", () => {
    expect(toPathArg("C:\\Users\\John Smith\\schema.json", "win32")).toBe('"C:\\Users\\John Smith\\schema.json"');
  });

  it("doubles trailing backslashes on Windows so they don't escape the closing quote", () => {
    expect(toPathArg("C:\\", "win32")).toBe('"C:\\\\"');
    expect(toPathArg("D:\\work\\\\", "win32")).toBe('"D:\\work\\\\\\\\"');
  });

  it("throws UNSAFE_PATH for a path outside the allowlist", () => {
    expect(() => toPathArg("C:\\a&calc", "win32")).toThrow(BridgeError);
    expect(() => toPathArg("/a%b", "linux")).toThrow(/unsafe/);
  });
});
