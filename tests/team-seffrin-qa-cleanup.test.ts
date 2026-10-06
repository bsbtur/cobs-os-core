import {describe,expect,test} from "vitest";
import {readFileSync} from "node:fs";

const migration=readFileSync("supabase/migrations/20261006203000_team_seffrin_qa_cleanup.sql","utf8");
const edge=readFileSync("supabase/functions/team-seffrin-qa-cleanup/index.ts","utf8");

describe("Team Seffrin QA cleanup",()=>{
  test("is restricted to synthetic QA orders",()=>{
    expect(migration).toContain("TEAM-SEFFRIN-BSB-20270416");
    expect(migration).toContain("qa_public_checkout");
    expect(migration).toContain("qa_environment");
    expect(migration).toContain("@example.com");
  });
  test("refuses settled financial facts",()=>{
    expect(migration).toContain("PAYMENT_RECORDED");
    expect(migration).toContain("QA cleanup refused: recorded financial facts exist");
  });
  test("releases reservation and cancels order",()=>{
    expect(migration).toContain("w09_release_reservation");
    expect(migration).toContain("status='cancelled'");
    expect(migration).toContain("status='revoked'");
  });
  test("requires checkout session possession",()=>{
    expect(edge).toContain("public_checkout_sessions");
    expect(edge).toContain("token_hash");
    expect(edge).toContain("cleanup_team_seffrin_qa_order");
  });
});
