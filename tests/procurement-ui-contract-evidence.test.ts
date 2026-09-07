import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/operations.$operationId.procurement.tsx",
  "utf8",
);
const nav = readFileSync("src/routes/_authenticated/operations.$operationId.tsx", "utf8");
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");

describe("procurement UI contractual evidence wiring", () => {
  test("uses only canonical procurement RPCs for state transitions", () => {
    expect(route).toContain('supabase.rpc("create_operation_quote"');
    expect(route).toContain('supabase.rpc("select_operation_quote"');
    expect(route).toContain('supabase.rpc("contract_operation_quote"');
    expect(runtimeTypes).toContain("create_operation_quote:");
    expect(runtimeTypes).toContain("select_operation_quote:");
    expect(runtimeTypes).toContain("contract_operation_quote:");
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
