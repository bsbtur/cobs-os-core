import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907053000_contract_document_pipeline_readiness_v1.sql",
  "utf8",
);
const route = readFileSync(
  "src/routes/_authenticated/operations.$operationId.contract-readiness.tsx",
  "utf8",
);
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");

describe("contract document pipeline readiness", () => {
  test("is read-only and role-gated", () => {
    expect(migration).toContain("get_contract_document_pipeline_readiness");
    expect(migration).toContain("owner','admin','operations_agent");
    expect(migration).not.toMatch(/update\s+public\./i);
    expect(migration).not.toMatch(/insert\s+into\s+public\./i);
    expect(migration).not.toContain("clicksign");
  });

  test("upload mode requires an explicit versioned renderer", () => {
    expect(migration).toContain("provider_document_mode");
    expect(migration).toContain("document_renderer_version");
    expect(migration).toContain("upload_renderer_not_registered");
    expect(migration).toContain("v_ready := v_renderer_version is not null");
  });

  test("readiness UI includes the document pipeline in technical readiness", () => {
    expect(runtimeTypes).toContain("get_contract_document_pipeline_readiness");
    expect(route).toContain('supabase.rpc("get_contract_document_pipeline_readiness"');
    expect(route).toContain("Pipeline de geração do documento contratual");
    expect(route).toContain("data.technical_ready && documentPipeline.ready");
  });

  test("never presents pipeline readiness as provider-send release", () => {
    expect(route).toContain("Envio ao provedor");
    expect(route).toContain("BLOQUEADO");
    expect(route).toContain("não gera contrato e não chama Clicksign");
  });
});
