import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source=readFileSync("supabase/functions/team-seffrin-public-create-pix/index.ts","utf8");

describe("Team Seffrin Pix entry",()=>{
  test("resolves entry from the order's commercial lot",()=>{
    expect(source).toContain("operation_commercial_lots");
    expect(source).toContain("commercial_lot_number");
    expect(source).toContain("entry_minor");
    expect(source).toContain("balance_minor");
  });

  test("keeps production fail closed behind sales and legal release",()=>{
    expect(source).toContain("sales_not_open");
    expect(source).toContain("legal_release_not_ready");
    expect(source).toContain("pending-legal-review");
  });

  test("routes QA orders to Mercado Pago test",()=>{
    expect(source).toMatch(/paymentEnv\s*=\s*"test"/);
    expect(source).toContain("MP_TEST_TOKEN");
    expect(source).toContain("qa_public_checkout");
  });

  test("leaves settlement authority to the webhook",()=>{
    expect(source).toMatch(/settlement_authority\s*:\s*"webhook"/);
    expect(source).toContain("awaiting_webhook");
    expect(source).not.toContain("record_provider_payment");
    expect(source).not.toContain("confirm_paid_provider_order");
  });
});
