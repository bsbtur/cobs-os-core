import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source=readFileSync("supabase/functions/team-seffrin-public-checkout/index.ts","utf8");

describe("Team Seffrin signed QA checkout",()=>{
  test("keeps public sales closed while allowing only signed preview requests",()=>{
    expect(source).toContain("sales_not_open");
    expect(source).toContain("signed-preview");
    expect(source).toContain("qa_signed_preview_forbidden");
    expect(source).toContain("open-preview");
    expect(source).toContain("nktohbqmcpgonlizzcka");
    expect(source).toContain("@example.com");
  });
  test("verifies ECDSA signature with short replay window",()=>{
    expect(source).toMatch(/namedCurve\s*:\s*"P-256"/);
    expect(source).toMatch(/name\s*:\s*"ECDSA"/);
    expect(source).toMatch(/5\s*\*\s*60\s*\*\s*1000/);
    expect(source).toMatch(/ts\s*\+\s*"\."\s*\+\s*raw/);
  });
  test("preserves existing staff-auth QA",()=>{
    expect(source).toContain("qa_invalid_session");
    expect(source).toContain("qa_membership_check_failed");
    expect(source).toContain("operations_agent");
  });
});
