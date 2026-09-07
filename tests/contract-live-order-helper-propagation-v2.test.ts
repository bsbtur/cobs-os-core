import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907110000_contract_live_order_helper_propagation_v2.sql",
  "utf8",
);

describe("contract live-order helper propagation v2", () => {
  test("uses the authoritative live production helper across every contractual surface", () => {
    expect(migration).toContain("upsert_order_contract_party_profile");
    expect(migration).toContain("get_operation_contract_workflow");
    expect(migration).toContain("get_operation_contract_readiness");
    expect(migration.match(/order_is_contractable_production/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("cr.expires_at>now()");
    expect(migration).not.toContain("order_matches_commerce_environment(o.tenant_id,o.id,'production')");
  });

  test("keeps provider and legal release fail-closed", () => {
    expect(migration).toContain("'provider_send_ready',false");
    expect(migration).toContain("'provider_send_exposed',false");
    expect(migration).not.toContain("contracts-clicksign-send");
    expect(migration).not.toMatch(/insert\s+into\s+public\.customer_contracts/i);
    expect(migration).not.toMatch(/update\s+public\.contract_templates/i);
    expect(migration).not.toMatch(/update\s+public\.privacy_policy_versions/i);
  });

  test("makes readiness language explicitly contractable-production scoped", () => {
    expect(migration).toContain("Pedidos de produção contratáveis com termos comerciais");
    expect(migration).toContain("Pedidos de produção contratáveis com dados jurídicos do viajante");
    expect(migration).toContain("Plano de pagamento dos pedidos de produção contratáveis");
    expect(migration).toContain("reservas expiradas");
    expect(migration).toContain("compromisso comercial efetivo");
  });
});
