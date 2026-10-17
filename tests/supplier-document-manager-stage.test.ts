import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ENABLE_SUPPLIER_DOCUMENT_MANAGER,
  supplierDocumentsState,
  SUPPLIER_DOCUMENT_STATUSES,
  SUPPLIER_DOCUMENT_TYPES,
  type SupplierDocument,
} from "../src/lib/supplier-document-manager";

const component = readFileSync("src/components/procurement/supplier-document-manager.tsx", "utf8");
const procurement = readFileSync("src/routes/_authenticated/operations.$operationId.procurement.tsx", "utf8");
const sample: SupplierDocument = {
  id: "synthetic-id", tenant_id: "tenant-a", operation_id: "operation-a",
  quote_id: "quote-a", title: "Contrato sintético", document_type: "contract",
  status: "received", reference_url: null, issued_at: null, expires_at: null,
};

describe("supplier document manager staged UI", () => {
  test("remains off and never fetches documents while disabled", () => {
    expect(ENABLE_SUPPLIER_DOCUMENT_MANAGER).toBe(false);
    expect(component).toContain("enabled: ENABLE_SUPPLIER_DOCUMENT_MANAGER");
    expect(component).toContain("if (!ENABLE_SUPPLIER_DOCUMENT_MANAGER) return null");
    expect(procurement).toContain("<SupplierDocumentManager");
  });
  test("enforces tenant and operation scoping in read and server-managed document writes", () => {
    expect(component).toMatch(/\.eq\("tenant_id", tenantId\)\s*\.eq\("operation_id", operationId\)/);
    expect(component).toContain('rpc("add_supplier_document"');
    expect(component).toContain('rpc("set_supplier_document_status"');
    expect(component).toContain("quotes.some((quote) => quote.id === quoteId)");
    expect(component).toContain("documents.data?.some((doc) => doc.id === id)");
    expect(component).not.toContain('.from("supplier_documents").insert');
    expect(component).not.toContain('.from("supplier_documents").update');
  });
  test("separates loading, error, empty and populated document list", () => {
    expect(supplierDocumentsState(true, false, null)).toBe("loading");
    expect(supplierDocumentsState(false, true, null)).toBe("error");
    expect(supplierDocumentsState(false, false, [])).toBe("empty");
    expect(supplierDocumentsState(false, false, [sample])).toBe("ready");
  });
  test("reuses only database-supported types and statuses", () => {
    expect(SUPPLIER_DOCUMENT_TYPES).toContain("insurance");
    expect(SUPPLIER_DOCUMENT_STATUSES).toContain("approved");
    expect(SUPPLIER_DOCUMENT_STATUSES).toContain("rejected");
  });
});
