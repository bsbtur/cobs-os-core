import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/operations.$operationId.procurement.tsx",
  "utf8",
);
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261006170000_operation_production_pipeline_v1.sql",
  "utf8",
);

describe("operation production pipeline", () => {
  test("shows the five canonical production stages", () => {
    expect(route).toContain('{ key: "planned", label: "Previsto"');
    expect(route).toContain('{ key: "quoted", label: "Cotado"');
    expect(route).toContain('{ key: "selected", label: "Selecionado"');
    expect(route).toContain('{ key: "contracted", label: "Contratado"');
    expect(route).toContain('{ key: "documented", label: "Documentado"');
  });

  test("reads the pipeline through an authorized rpc instead of supplier tables", () => {
    expect(route).toContain('supabase.rpc("get_operation_production_pipeline"');
    expect(runtimeTypes).toContain("get_operation_production_pipeline:");
    expect(migration).toContain("app_private.has_tenant_role");
    expect(migration).toContain("operations_agent");
    expect(migration).not.toMatch(/update\s+public\./i);
    expect(migration).not.toMatch(/insert\s+into\s+public\./i);
    expect(migration).not.toMatch(/delete\s+from\s+public\./i);
  });

  test("only marks a contracted supplier documented when every linked document is approved", () => {
    expect(migration).toContain("q.status='contracted'");
    expect(migration).toContain("coalesce(ds.approved_documents,0) = coalesce(ds.total_documents,0)");
    expect(migration).toContain("then 'documented'");
  });

  test("keeps planned suppliers visible before a priced quote exists", () => {
    expect(migration).toContain("supplier_documents");
    expect(migration).toContain("else 'planned'");
    expect(route).toContain("Aguardando valor real");
  });
});
