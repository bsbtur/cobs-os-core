import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907044000_contract_production_environment_gate_v1.sql",
  "utf8",
);
const commerceIsolation = readFileSync(
  "supabase/migrations/20260905162010_commerce_environment_isolation_v1.sql",
  "utf8",
);
const normalizedMigration = migration.replace(/\s+/g, "");

describe("contract production environment gate", () => {
  test("mirrors the canonical Commerce QA signals", () => {
    for (const signal of [
      "qa_public_checkout",
      "qa_environment",
      "qa_payment_environment",
      "pc.metadata->>'environment'='test'",
      "pc.metadata->>'environment'='production'",
      "public_checkout",
    ]) {
      expect(normalizedMigration).toContain(signal.replace(/\s+/g, ""));
    }
    expect(commerceIsolation).toContain("list_orders_by_environment");
  });

  test("filters readiness and contract-party UI to production orders", () => {
    expect(
      migration.match(/order_matches_commerce_environment\(o\.tenant_id,o\.id,'production'\)/g)
        ?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("Leitura de prontidão de produção");
    expect(normalizedMigration).toContain("notis_qaand(source<>'public_checkout'orhas_production_charge)");
  });

  test("blocks database creation of CIOSP-2027 contracts from QA or excluded orders", () => {
    expect(migration).toContain("customer_contracts_production_environment_guard");
    expect(migration).toContain("new.template_key='CIOSP-2027'");
    expect(migration).toContain("production_contract_order_required");
    expect(migration).toContain("before insert or update of tenant_id,order_id,template_key");
  });

  test("never marks legal review, sends provider calls, or moves money", () => {
    expect(migration).not.toMatch(/update\s+public\.contract_templates/i);
    expect(migration).not.toMatch(/update\s+public\.privacy_policy_versions/i);
    expect(migration).not.toContain("clicksign");
    expect(migration).toContain("'provider_send_ready',false");
  });
});
