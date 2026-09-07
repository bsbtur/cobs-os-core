import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const renderer = readFileSync("supabase/functions/contracts-render-pdf/index.ts", "utf8");
const sender = readFileSync("supabase/functions/contracts-clicksign-send/index.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260907060000_contract_document_renderer_integrity_v1.sql",
  "utf8",
);

describe("contracts PDF renderer v1", () => {
  test("renders only a draft contract with formally reviewed exact template evidence", () => {
    expect(renderer).toContain('contract.status !== "draft"');
    expect(renderer).toContain('eq("version", contract.template_version)');
    expect(renderer).toContain('eq("status", "active")');
    expect(renderer).toContain("formal_legal_validation_required");
    expect(renderer).toContain('template.document_renderer_version !== RENDERER_VERSION');
  });

  test("uses only frozen source and contract snapshot variables and fails unresolved placeholders", () => {
    expect(renderer).toContain("document_source_snapshot");
    expect(renderer).toContain("document_source_hash");
    expect(renderer).toContain("contract.metadata.contract_snapshot");
    expect(renderer).toContain("snapshot.variables");
    expect(renderer).toContain("contract_placeholders_unresolved");
    expect(renderer).not.toContain("OpenAI");
    expect(renderer).not.toContain("anthropic");
  });

  test("writes only a private deterministic PDF and keeps provider send blocked", () => {
    expect(renderer).toContain('const BUCKET = "customer-contracts"');
    expect(renderer).toContain('contentType: "application/pdf"');
    expect(renderer).toContain("original-${documentHash}.pdf");
    expect(renderer).toContain("document_hash: documentHash");
    expect(renderer).toContain("ready_for_provider_send: false");
    expect(renderer).not.toContain("CLICKSIGN_ACCESS_TOKEN");
    expect(renderer).not.toContain("/envelopes");
  });

  test("freezes reviewed source and requires the implemented renderer", () => {
    expect(migration).toContain("reviewed_contract_document_source_immutable");
    expect(migration).toContain("active_contract_document_source_immutable");
    expect(migration).toContain("v_renderer_supported := v_renderer_version='pdf-lib-v1'");
    expect(migration).toContain("v_ready := v_source_valid and v_renderer_supported");
    expect(migration).not.toMatch(/legal_reviewed_at\s*=\s*now\(\)/i);
    expect(migration).not.toMatch(/status\s*=\s*'active'/i);
  });

  test("sender verifies the frozen PDF hash before the first Clicksign call", () => {
    expect(sender).toContain("document_hash");
    expect(sender).toContain("contract_document_hash_missing");
    expect(sender).toContain("contract_pdf_hash_mismatch");
    const hashCheck = sender.indexOf("contract_pdf_hash_mismatch");
    const firstProviderAttempt = sender.indexOf('await attempt("envelope")');
    expect(hashCheck).toBeGreaterThan(-1);
    expect(firstProviderAttempt).toBeGreaterThan(hashCheck);
  });
});
