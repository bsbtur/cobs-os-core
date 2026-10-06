import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
const source=readFileSync("supabase/functions/team-seffrin-public-create-pix/index.ts","utf8");
describe("Team Seffrin Pix entry",()=>{
 test("pins the founders entry and total",()=>{expect(source).toContain("999700");expect(source).toContain("199700");expect(source).toContain("800000");});
 test("keeps production fail closed behind sales and legal release",()=>{expect(source).toContain("sales_not_open");expect(source).toContain("legal_release_not_ready");expect(source).toContain("pending-legal-review");});
 test("routes QA orders to Mercado Pago test",()=>{expect(source).toContain('paymentEnv="test"');expect(source).toContain("MERCADO_PAGO_TEST_ACCESS_TOKEN");});
 test("leaves settlement authority to the webhook",()=>{expect(source).toContain('settlement_authority:"webhook"');expect(source).toContain("awaiting_webhook");});
});