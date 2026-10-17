-- COBS OS PR #505 / candidate guard, not deployed.
-- Apply only in disposable PostgreSQL during behavioral QA until reviewed.
CREATE OR REPLACE FUNCTION public.guard_supplier_document_relations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.operations o
    WHERE o.id = NEW.operation_id AND o.tenant_id = NEW.tenant_id
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'supplier_document_operation_tenant_mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = NEW.supplier_id AND s.tenant_id = NEW.tenant_id
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'supplier_document_supplier_tenant_mismatch';
  END IF;
  IF NEW.quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.operation_quotes q
    WHERE q.id = NEW.quote_id AND q.tenant_id = NEW.tenant_id
      AND q.operation_id = NEW.operation_id AND q.supplier_id = NEW.supplier_id
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'supplier_document_quote_context_mismatch';
  END IF;
  RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS guard_supplier_document_relations ON public.supplier_documents;
CREATE TRIGGER guard_supplier_document_relations
BEFORE INSERT OR UPDATE OF tenant_id, operation_id, quote_id, supplier_id
ON public.supplier_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_document_relations();
REVOKE ALL ON FUNCTION public.guard_supplier_document_relations() FROM PUBLIC, anon, authenticated;
