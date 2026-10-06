import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source=readFileSync("supabase/functions/team-seffrin-public-checkout/index.ts","utf8");

describe("Team Seffrin public checkout",()=>{
  test("uses the generic checkout v2 RPC",()=>{
    expect(source).toContain("create_public_checkout_order_v2");
    expect(source).toContain("TEAM-SEFFRIN-BSB-20270416");
  });
  test("fails closed while public sales are disabled",()=>{
    expect(source).toContain("sales_not_open");
    expect(source).toContain("x-team-seffrin-qa");
    expect(source).toContain("qa_forbidden");
  });
  test("requires commercial and cancellation versions",()=>{
    expect(source).toContain("commercial_terms_version_mismatch");
    expect(source).toContain("cancellation_policy_version_mismatch");
  });
});