import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907035500_contract_readiness_reservation_link_v2.sql",
  "utf8",
);

describe("contract readiness reservation link v2", () => {
  test("resolves reservations through their order", () => {
    expect(migration).toContain("cr.order_id=co.id");
    expect(migration).not.toContain("cr.operation_id");
    expect(migration).toContain("off.id=cr.offering_id");
  });

  test("evaluates commercial terms and payment schedule per contractable order", () => {
    expect(migration).toContain("v_terms_ready_count=v_order_count");
    expect(migration).toContain("v_payment_ready_count=v_order_count");
    expect(migration).toContain("co.grand_total_minor");
    expect(migration).toContain("payment_schedule_v1");
  });

  test("remains fail-closed and read-only", () => {
    expect(migration).toContain("'provider_send_ready',false");
    expect(migration).not.toMatch(/update\s+public\./i);
    expect(migration).not.toMatch(/insert\s+into\s+public\./i);
    expect(migration).not.toContain("contracts-clicksign-send");
  });
});
