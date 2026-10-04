import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("supabase/migrations/20260907035000_contract_readiness_v1.sql", "utf8");
const route = readFileSync("src/routes/_authenticated/operations.$operationId.contract-readiness.tsx", "utf8");
const workspace = readFileSync("src/routes/_authenticated/operations.$operationId.tsx", "utf8");
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");
const normalizedRoute = route.replace(/\s+/g, " ");

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
    expect(migration).not.toMatch(/update\s+public\.operation_quotes/i);
    expect(route).not.toContain("contracts-clicksign-send");
    expect(route).not.toContain("contracts-generate");
  });

  test("explains blocked zero-order checks without implying 0/0 completion", () => {
    expect(route).toContain("Nenhum pedido de produção contratável encontrado");
    expect(route).toContain('["commercial_terms", "customer_contract_data", "payment_schedule"]');
    expect(route).toContain('check.status === "blocked"');
  });

  test("separates technical and legal blockers", () => {
    expect(migration).toContain("'kind','legal'");
    expect(migration).toContain("'kind','technical'");
    expect(route).toContain("Prontidão Contratual");
    expect(route).toContain("Jurídico");
    expect(route).toContain("Técnico");
    expect(route).toContain('data.provider_send_ready ? "PRONTO" : "BLOQUEADO"');
  });

  test("renders provider status from canonical backend readiness", () => {
    expect(route).toContain('data.provider_send_ready ? "PRONTO" : "BLOQUEADO"');
    expect(migration).toContain("'provider_send_ready',false");
  });

  test("counts only canonical backend readiness checks", () => {
    expect(route).toContain("const checks: ReadinessCheck[] = data.checks.map");
    expect(route).not.toContain('detail.startsWith("0/0")');
    expect(route).not.toContain('key: "production_order"');
    expect(route).not.toContain("noProductionOrders");
    expect(route).toContain('checks.filter((check) => check.status === "blocked").length');
  });

  test("keeps canonical readiness visible when document enrichment fails", () => {
    expect(route).toContain("documentPipeline: documentError ? null");
    expect(route).toContain("if (!documentPipeline) return check;");
    expect(route).not.toContain("if (documentError) throw documentError;");
    expect(route).toContain("const technicalReady = data.technical_ready;");
  });

  test("links remediation without fabricating evidence", () => {
    expect(workspace).toContain('to: "/operations/$operationId/contract-readiness"');
    expect(route).toContain('to="/operations/$operationId/procurement"');
    expect(route).toContain('to="/settings/privacy"');
    expect(normalizedRoute).toContain("nenhuma pendência deve ser preenchida automaticamente");
  });
});
