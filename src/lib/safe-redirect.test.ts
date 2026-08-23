import { describe, expect, it } from "bun:test";

import { isSafeAppPath } from "@/lib/safe-redirect";

describe("isSafeAppPath", () => {
  it("accepts normal application paths", () => {
    expect(isSafeAppPath("/app")).toBe(true);
    expect(isSafeAppPath("/my/op-1?tab=journey#now")).toBe(true);
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(isSafeAppPath("https://evil.example/phish")).toBe(false);
    expect(isSafeAppPath("//evil.example/phish")).toBe(false);
  });

  it("rejects backslash variants that browsers can normalize cross-origin", () => {
    expect(isSafeAppPath("/\\evil.example/phish")).toBe(false);
    expect(isSafeAppPath("/\\\\evil.example/phish")).toBe(false);
  });

  it("rejects empty, relative, and control-character paths", () => {
    expect(isSafeAppPath(undefined)).toBe(false);
    expect(isSafeAppPath("")).toBe(false);
    expect(isSafeAppPath("app")).toBe(false);
    expect(isSafeAppPath("/app\nnext")).toBe(false);
  });
});
