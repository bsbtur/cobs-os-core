import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/operations.$operationId.procurement.tsx",
  "utf8",
);
const nav = readFileSync("src/routes/_authenticated/operations.$operationId.tsx", "utf8");
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260907023000_get_operation_procurement_quotes_v1.sql",
  "utf8",
);

describe("procurement UI contractual evidence wiring", () => {
  test("uses canonical procurement RPCs for reads and state transitions", () => {
    expect(route).toContain('supabase.rpc("get_operation_procurement_quotes"');
    expect(route).toContain('supabase.rpc("create_operation_quote"');
    expect(route).toContain('supabase.rpc("select_operation_quote"');
    expect(route).toContain('supabase.rpc("contract_operation_quote"');
    expect(route).not.toContain('.from("operation_quotes")');
    expect(runtimeTypes).toContain("get_operation_procurement_quotes:");
    expect(runtimeTypes).toContain("create_operation_quote:");
    expect(runtimeTypes).toContain("select_operation_quote:");
    expect(runtimeTypes).toContain("contract_operation_quote:");
  });

  test("keeps the read projection authorized and mutation-free", () => {
    expect(migration).toContain("get_operation_procurement_quotes");
    expect(migration).toContain("operations_agent");
    expect(migration).toContain("app_private.has_tenant_role");
    expect(migration).not.toMatch(/update\s+public\.operation_quotes/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.operation_quotes/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.operation_quotes/i);
  });

  test("keeps contract formalization explicit and management-gated", () => {
    expect(route).toContain("const { canManage } = useTenant()");
    expect(route).toContain('quote.status === "selected"');
    expect(route).toContain("!reference.trim()");
    expect(route).toContain("Nenhum dado jurídico será preenchido automaticamente");
    expect(route).not.toContain("status: \"contracted\"");
  });

  test("exposes procurement inside the operation workspace", () => {
    expect(nav).toContain('to: "/operations/$operationId/procurement" as const');
    expect(nav).toContain('label: "Fornecedores"');
  });
});
