-- QA ONLY: prevent loss of supplier_documents even from FK ON DELETE CASCADE.
-- PostgreSQL FK cascading actions execute DELETE row triggers on supplier_documents.
CREATE OR REPLACE FUNCTION public.qa_preserve_supplier_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $body$
BEGIN
 RAISE EXCEPTION 'supplier_document_retention_blocked'
 USING ERRCODE='P0001', DETAIL='RD-DOC-01: document deletion requires an approved retention workflow';
END
$body$;
CREATE TRIGGER qa_preserve_supplier_document
BEFORE DELETE ON public.supplier_documents
FOR EACH ROW EXECUTE FUNCTION public.qa_preserve_supplier_document();
REVOKE ALL ON FUNCTION public.qa_preserve_supplier_document() FROM PUBLIC,anon,authenticated;
