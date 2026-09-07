import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907040500_contract_readiness_contractable_orders_v3.sql",
  "utf8",
);

describe("contract readiness contractable orders v3", () => {
  test("requires a live reservation before an order participates in readiness", () => {
    expect(migration.match(/exists \(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("cr.order_id=o.id");
    expect(migration).toContain("cr.status in ('reserved','confirmed')");
    expect(migration).toContain("cr.offering_id is not null");
  });

  test("keeps active-reservation orders fail closed on evidence", () => {
    expect(migration).toContain("v_party_ready_count=v_order_count");
    expect(migration).toContain("v_terms_ready_count=v_order_count");
    expect(migration).toContain("v_payment_ready_count=v_order_count");
    expect(migration).toContain("v_supplier_total>0");
  });

  test("remains read-only and never releases provider send", () => {
    expect(migration).toContain("'provider_send_ready',false");
    expect(migration).not.toMatch(/update\s+public\./i);
    expect(migration).not.toMatch(/insert\s+into\s+public\./i);
    expect(migration).toContain("Pedidos sem reserva ativa não são considerados contratáveis");
  });
});
