import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "supabase/functions/ciosp-public-create-pix/index.ts",
  "utf8",
);

describe("CIOSP Pix runtime amount", () => {
  test("amount remains mutable because reused charge amount is authoritative", () => {
    expect(source).toMatch(
      /let\s+amount\s*=\s*Math\.min\(entry\s*-\s*paid\s*,\s*total\s*-\s*paid\)/,
    );
    expect(source).toMatch(/amount\s*=\s*Number\(charge\.amount_minor\)/);
    expect(source).not.toMatch(
      /const\s+amount\s*=\s*Math\.min\(entry\s*-\s*paid\s*,\s*total\s*-\s*paid\)/,
    );
  });
});
