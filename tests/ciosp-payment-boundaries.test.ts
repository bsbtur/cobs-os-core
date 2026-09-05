import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const pix = readFileSync("supabase/functions/ciosp-public-create-pix/index.ts", "utf8");
const checkout = readFileSync("supabase/functions/ciosp-public-checkout/index.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260905150000_ciosp_payment_idempotency_environment_v1.sql",
  "utf8",
);

describe("CIOSP payment boundaries", () => {
  it("filters reusable charges and attempts by payment environment", () => {
    expect(pix).toMatch(/metadata\?\.environment\s*===\s*MP_PAYMENT_ENV/);
    expect(pix).toMatch(/metadata\?\.environment\s*===\s*MP_PAYMENT_ENV/);
    expect(pix).toContain("reservation_id: reservationId");
  });

  it("has database uniqueness for live charge and attempt races", () => {
    expect(migration).toContain("payment_charges_ciosp_live_installment_environment_uidx");
    expect(migration).toContain("payment_attempts_ciosp_live_environment_uidx");
    expect(migration).toContain("status in ('draft', 'pending', 'processing')");
  });

  it("does not authorize QA from client-controlled name or email", () => {
    expect(checkout).not.toContain("isAuthorizedPreviewQa");
    expect(checkout).not.toContain("example\\.com\\.br");
    expect(checkout).toContain("auth.getUser()");
    expect(checkout).toContain(".from(\"memberships\")");\n    expect(checkout).toContain('.select("role,status")');
  });
});
