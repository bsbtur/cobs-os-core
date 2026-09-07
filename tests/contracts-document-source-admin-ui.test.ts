import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const route = readFileSync("src/routes/_authenticated/settings_.contracts.tsx", "utf8");
const settings = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260907061500_contract_document_source_admin_read_v1.sql",
  "utf8",
);

describe("contract document source admin UI", () => {
  test("uses owner/admin read and registration RPCs only", () => {
    expect(migration).toContain("get_contract_document_source_for_admin");
    expect(migration).toContain("owner','admin'");
    expect(route).toContain('supabase.rpc("get_contract_document_source_for_admin"');
    expect(route).toContain('supabase.rpc("register_contract_document_source_draft"');
    expect(runtimeTypes).toContain("get_contract_document_source_for_admin");
    expect(runtimeTypes).toContain("register_contract_document_source_draft");
  });

  test("never exposes or auto-generates the frozen legal body", () => {
    expect(migration).toContain("document_source_registered");
    expect(migration).toContain("document_source_hash");
    expect(migration).not.toContain("'document_source_snapshot',v_template.document_source_snapshot");
    expect(route).toContain("O corpo contratual não é exibido nesta interface");
    expect(route).not.toContain("OpenAI");
    expect(route).not.toContain("anthropic");
  });

  test("pins CIOSP V3.1 and the implemented renderer without legal activation", () => {
    expect(route).toContain('const TEMPLATE_KEY = "CIOSP-2027"');
    expect(route).toContain('const TEMPLATE_VERSION = "V3.1"');
    expect(route).toContain('const RENDERER_VERSION = "pdf-lib-v1"');
    expect(route).toContain("não ativa o template");
    expect(route).toContain("não registra revisão jurídica");
    expect(route).toContain("não gera PDF");
    expect(route).toContain("não chama Clicksign");
    expect(route).not.toContain("legal_reviewed_at: new Date");
  });

  test("does not offer silent overwrite of an existing source", () => {
    expect(route).toContain("!state.document_source_registered");
    expect(route).toContain("Alterações devem");
    expect(route).toContain("nova versão do template");
  });

  test("is discoverable from settings and remains metadata-only on read", () => {
    expect(settings).toContain('to="/settings/contracts"');
    expect(settings).toContain("Fonte Documental do Contrato");
    expect(migration).not.toMatch(/update\s+public\./i);
    expect(migration).not.toMatch(/insert\s+into\s+public\./i);
  });
});
