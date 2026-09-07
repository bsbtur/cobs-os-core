import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907024500_supplier_legal_profile_rpc_v1.sql",
  "utf8",
);
const dialog = readFileSync(
  "src/components/procurement/supplier-legal-profile-dialog.tsx",
  "utf8",
);
const route = readFileSync(
  "src/routes/_authenticated/operations.$operationId.procurement.tsx",
  "utf8",
);

describe("supplier legal profile UI", () => {
  test("keeps legal profile update owner/admin only and audited", () => {
    expect(migration).toContain("update_supplier_contract_legal_profile");
    expect(migration).toContain("array['owner','admin']");
    expect(migration).toContain("supplier.legal_profile_updated");
    expect(migration).toContain("supplier_legal_evidence_required");
    expect(migration).toContain("supplier_country_code_invalid");
  });

  test("never changes quote or contract state while updating supplier legal data", () => {
    expect(migration).not.toMatch(/update\s+public\.operation_quotes/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.customer_contracts/i);
    expect(migration).not.toContain("clicksign");
    expect(migration).not.toContain("status='contracted'");
  });

  test("requires real complete fields in the UI and does not auto-fill legal identity", () => {
    expect(dialog).toContain('supabase.rpc("update_supplier_contract_legal_profile"');
    expect(dialog).toContain("Informe somente dados reais do fornecedor");
    expect(dialog.replace(/\s+/g, " ")).toContain(
      "não consulta nem completa dados jurídicos automaticamente",
    );
    expect(dialog).toContain("documentNumber.trim()");
    expect(dialog).toContain("addressLine1.trim()");
    expect(dialog).toContain("postalCode.trim()");
    expect(dialog).toContain("countryCode.trim().length === 2");
  });

  test("blocks formalization in the UI while supplier legal evidence is incomplete", () => {
    expect(route).toContain("disabled={!quote.supplier_legal_evidence_complete}");
    expect(route).toContain("Cadastro jurídico pendente");
    expect(route).toContain("Cadastro jurídico completo");
  });
});
