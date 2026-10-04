import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907063000_operation_contract_workflow_read_v1.sql",
  "utf8",
);
const route = readFileSync(
  "src/routes/_authenticated/operations.$operationId.contracts.tsx",
  "utf8",
);
const workspace = readFileSync(
  "src/routes/_authenticated/operations.$operationId.tsx",
  "utf8",
);
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");
const normalizedRoute = route.replace(/\s+/g, " ");

describe("operation contract workflow UI v1", () => {
  test("lists only canonical production contractable orders", () => {
    expect(migration).toContain("get_operation_contract_workflow");
    expect(migration).toContain("order_matches_commerce_environment(o.tenant_id,o.id,'production')");
    expect(migration).toContain("o.status in ('submitted','confirmed')");
    expect(migration).toContain("cr.status in ('reserved','confirmed')");
    expect(migration).not.toMatch(/insert\s+into\s+public\./i);
    expect(migration).not.toMatch(/update\s+public\./i);
  });

  test("gates draft generation on technical, legal and document readiness", () => {
    expect(route).toContain("readiness.technical_ready && readiness.legal_ready && pipeline.ready");
    expect(route).toContain('supabase.functions.invoke("contracts-generate"');
    expect(route).toContain("row.party_profile_complete");
    expect(route).toContain("!row.contract_id");
  });

  test("renders only an existing ready draft and never exposes provider send", () => {
    expect(route).toContain('supabase.functions.invoke("contracts-render-pdf"');
    expect(route).toContain('row.contract_status === "draft"');
    expect(route).toContain("row.ready_for_render");
    expect(route).toContain("!row.document_rendered");
    expect(normalizedRoute).toContain("Envio ao Clicksign não está disponível nesta tela");
    expect(route).not.toContain('functions.invoke("contracts-clicksign-send"');
    expect(migration).toContain("'provider_send_exposed',false");
  });

  test("supports contract operator roles without widening backend authority", () => {
    expect(migration).toContain("owner','admin','operations_agent");
    expect(route).toContain('role === "owner" || role === "admin" || role === "operations_agent"');
    expect(runtimeTypes).toContain("get_operation_contract_workflow");
  });

  test("is discoverable from operation navigation", () => {
    expect(workspace).toContain('to: "/operations/$operationId/contracts"');
    expect(workspace).toContain('label: "Contratos"');
  });
});
