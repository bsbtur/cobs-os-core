import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907042000_contract_party_profile_ui_v1.sql",
  "utf8",
);
const route = readFileSync(
  "src/routes/_authenticated/operations.$operationId.contract-parties.tsx",
  "utf8",
);
const readiness = readFileSync(
  "src/routes/_authenticated/operations.$operationId.contract-readiness.tsx",
  "utf8",
);
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");

describe("contract party profile UI v1", () => {
  test("reads only contractable orders and resolves buyer server-side", () => {
    expect(migration).toContain("get_operation_contract_parties");
    expect(migration).toContain("cr.order_id=o.id");
    expect(migration).toContain("cr.status in ('reserved','confirmed')");
    expect(migration).toContain("v_order.buyer_person_id");
    expect(runtimeTypes).toContain("get_operation_contract_parties");
  });

  test("allows profile mutation only to owner/admin and only for a live reservation", () => {
    expect(migration).toContain("upsert_order_contract_party_profile");
    expect(migration).toContain("array['owner','admin']::public.app_role[]");
    expect(migration).toContain("active_reservation_required");
    expect(migration).toContain("on conflict (tenant_id,person_id) do update");
    expect(runtimeTypes).toContain("upsert_order_contract_party_profile");
  });

  test("does not mutate contract, supplier, payment or legal release state", () => {
    expect(migration).not.toContain("insert into public.customer_contracts");
    expect(migration).not.toMatch(/update\s+public\.operation_quotes/i);
    expect(migration).not.toMatch(/update\s+public\.contract_templates/i);
    expect(migration).not.toMatch(/update\s+public\.privacy_policy_versions/i);
    expect(migration).not.toContain("clicksign");
    expect(route).not.toContain("contracts-generate");
  });

  test("keeps document and address values out of audit metadata", () => {
    const auditTail = migration.slice(migration.indexOf("perform app_private.record_audit_event"));
    expect(auditTail).not.toContain("v_document_number");
    expect(auditTail).not.toContain("v_address_line1");
    expect(auditTail).not.toContain("v_postal_code");
  });

  test("UI requires explicit real data and does not auto-fill from external sources", () => {
    const normalized = route.replace(/\s+/g, " ");
    expect(normalized).toContain("Informe somente dados reais fornecidos ou documentalmente confirmados pelo viajante");
    expect(normalized).toContain("não preenche esses campos automaticamente");
    expect(route).toContain("canManage ? <ContractPartyDialog");
    expect(route).toContain('supabase.rpc("upsert_order_contract_party_profile"');
    expect(route).not.toContain("fetch(");
    expect(readiness).toContain('to="/operations/$operationId/contract-parties"');
  });
});
