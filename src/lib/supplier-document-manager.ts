// Rollout gate: keep the document manager hidden and all its queries disabled until QA authorization.
export const ENABLE_SUPPLIER_DOCUMENT_MANAGER = false;

export type SupplierDocument = {
  id: string;
  tenant_id: string;
  operation_id: string;
  quote_id: string | null;
  document_type: string;
  title: string;
  status: string;
  reference_url: string | null;
  issued_at: string | null;
  expires_at: string | null;
};

export const SUPPLIER_DOCUMENT_TYPES = ["quote", "contract", "invoice", "receipt", "insurance", "license", "other"] as const;
export const SUPPLIER_DOCUMENT_STATUSES = ["pending", "received", "approved", "rejected", "expired"] as const;

export function supplierDocumentsState(
  isPending: boolean,
  isError: boolean,
  documents: SupplierDocument[] | null | undefined,
): "loading" | "error" | "empty" | "ready" {
  if (isPending) return "loading";
  if (isError) return "error";
  if (!documents?.length) return "empty";
  return "ready";
}
