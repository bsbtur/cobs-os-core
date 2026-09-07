import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("supabase/migrations/20260907035000_contract_readiness_v1.sql", "utf8");
const route = readFileSync("src/routes/_authenticated/operations.$operationId.contract-readiness.tsx", "utf8");
const workspace = readFileSync("src/routes/_authenticated/operations.$operationId.tsx", "utf8");
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");

describe("contract readiness panel", () => {
  test("uses a role-gated read-only RPC", () => {
    expect(migration).toContain("get_operation_contract_readiness");
    expect(migration).toContain("owner','admin','operations_agent");
    expect(migration).toContain("Read-only contract readiness projection");
    expect(runtimeTypes).toContain("get_operation_contract_readiness");
    expect(route).toContain('supabase.rpc("get_operation_contract_readiness"');
  });

  test("never releases provider send or legal state", () => {
    expect(migration).toContain("'provider_send_ready',false");
    expect(migration).not.toContain("update public.contract_templates");
    expect(migration).not.toContain("update public.privacy_policy_versions");
    expect(migration).not.toContain("insert into public.customer_contracts");
    expect(migration).not.toContain("status='contracted'");
    expect(route).not.toContain("contracts-clicksign-send");
    expect(route).not.toContain("contracts-generate");
  });

  test("separates technical and legal blockers", () => {
    expect(migration).toContain("'kind','legal'");
    expect(migration).toContain("'kind','technical'");
    expect(route).toContain("Prontidão Contratual");
    expect(route).toContain("Jurídico");
    expect(route).toContain("Técnico");
    expect(route).toContain("BLOQUEADO");
  });

  test("links remediation without fabricating evidence", () => {
    expect(workspace).toContain('to: "/operations/$operationId/contract-readiness"');
    expect(route).toContain('to="/operations/$operationId/procurement"');
    expect(route).toContain('to="/settings/privacy"');
    expect(route).toContain("nenhuma pendência deve ser preenchida automaticamente");
  });
});
