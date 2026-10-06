import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const status=readFileSync("supabase/functions/team-seffrin-public-order-status/index.ts","utf8");
const card=readFileSync("supabase/functions/team-seffrin-public-pay-card/index.ts","utf8");

describe("Team Seffrin payment status",()=>{
  test("reports entry and balance independently",()=>{
    expect(status).toContain("entry_status");
    expect(status).toContain("balance_status");
    expect(status).toContain("locked_until_entry");
    expect(status).toContain("commercial_lot_number");
  });
  test("uses financial facts as settlement truth",()=>{
    expect(status).toContain("financial_facts");
    expect(status).toContain("PAYMENT_RECORDED");
    expect(status).toContain("REFUND_RECORDED");
  });
});

describe("Team Seffrin card balance",()=>{
  test("requires confirmed entry before charging",()=>{
    expect(card).toContain("entry_not_confirmed");
    expect(card).toContain("entry_minor");
    expect(card).toContain("balance_minor");
  });
  test("uses lot installment ceiling",()=>{
    expect(card).toContain("balance_card_installments_max");
    expect(card).toContain("max_installments");
  });
  test("keeps production gated and webhook authoritative",()=>{
    expect(card).toContain("sales_not_open");
    expect(card).toContain("legal_release_not_ready");
    expect(card).toContain("settlement_authority");
    expect(card).toContain("webhook");
    expect(card).toContain("awaiting_webhook");
  });
});