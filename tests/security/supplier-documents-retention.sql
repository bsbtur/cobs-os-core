\set ON_ERROR_STOP on
-- Run ONLY against supplier_retention_baseline / supplier_retention_guarded disposable DB.
INSERT INTO public.tenants(id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
('cccccccc-cccc-cccc-cccc-cccccccccccc');
INSERT INTO public.operations(id,tenant_id) VALUES
('a0000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('b0000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
('c0000000-0000-0000-0000-000000000001','cccccccc-cccc-cccc-cccc-cccccccccccc');
INSERT INTO public.suppliers(id,tenant_id,name,category) VALUES
('a1000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Alpha Supplier','transport'),
('b1000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Beta Supplier','transport'),
('c1000000-0000-0000-0000-000000000001','cccccccc-cccc-cccc-cccc-cccccccccccc','Gamma Supplier','transport');
INSERT INTO public.operation_quotes(id,tenant_id,operation_id,supplier_id,category,description,amount_minor) VALUES
('a2000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','transport','Synthetic quote',10000);
INSERT INTO public.supplier_documents(id,tenant_id,operation_id,quote_id,supplier_id,document_type,title) VALUES
('a4000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','contract','Signed contract'),
('b4000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','b0000000-0000-0000-0000-000000000001',null,'b1000000-0000-0000-0000-000000000001','receipt','Receipt without quote'),
('c4000000-0000-0000-0000-000000000001','cccccccc-cccc-cccc-cccc-cccccccccccc','c0000000-0000-0000-0000-000000000001',null,'c1000000-0000-0000-0000-000000000001','invoice','Tenant invoice');

-- Transactional probes rollback on every successful deletion and on every rejected deletion.
CREATE TABLE public.retention_qa_results(probe text PRIMARY KEY, outcome text NOT NULL, detail text);
CREATE OR REPLACE FUNCTION public.retention_qa_probe(label text,statement text,expected_block boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $qa$
DECLARE rejected boolean:=false; msg text; before_count bigint; after_count bigint;
BEGIN
 SELECT count(*) INTO before_count FROM public.supplier_documents;
 BEGIN
  EXECUTE statement;
  IF expected_block THEN RAISE EXCEPTION 'RETENTION FAILURE: % unexpectedly deleted evidence',label; END IF;
  SELECT count(*) INTO after_count FROM public.supplier_documents;
  IF after_count >= before_count THEN RAISE EXCEPTION 'BASELINE FAILURE: % did not delete evidence',label; END IF;
  -- Undo the baseline deletion without undoing the surrounding test suite.
  RAISE EXCEPTION 'qa_rollback_successful_baseline' USING ERRCODE='P0002';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg='qa_rollback_successful_baseline' THEN
    IF expected_block THEN RAISE EXCEPTION 'RETENTION FAILURE: expected rejection for %',label; END IF;
  ELSIF msg='supplier_document_retention_blocked' THEN
    IF NOT expected_block THEN RAISE EXCEPTION 'BASELINE FAILURE: unexpected retention trigger %',label; END IF;
    rejected:=true;
  ELSE
    RAISE EXCEPTION 'WRONG ERROR in %: %',label,msg;
  END IF;
 END;
 IF expected_block AND NOT rejected THEN RAISE EXCEPTION 'RETENTION FAILURE: missing trigger rejection %',label; END IF;
 -- Verify all referenced rows survive the attempted operation.
 IF (SELECT count(*) FROM public.supplier_documents)<>before_count THEN
  RAISE EXCEPTION 'RETENTION FAILURE: documents missing after rollback %',label;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operation_quotes WHERE id='a2000000-0000-0000-0000-000000000001') THEN
  RAISE EXCEPTION 'RETENTION FAILURE: quote missing after rollback %',label;
 END IF;
 IF (SELECT count(*) FROM public.operations)<>3 OR (SELECT count(*) FROM public.suppliers)<>3 OR
    (SELECT count(*) FROM public.tenants)<>3 THEN
  RAISE EXCEPTION 'RETENTION FAILURE: parent state changed after rollback %',label;
 END IF;
 INSERT INTO public.retention_qa_results VALUES(label,CASE WHEN expected_block THEN 'blocked' ELSE 'baseline_deleted' END,msg);
 RAISE NOTICE 'PASS RD-DOC-01 % (%)',label,CASE WHEN expected_block THEN 'blocked and preserved' ELSE 'baseline deletion reproduced and rolled back' END;
END $qa$;
SELECT public.retention_qa_probe('direct contract', $del$DELETE FROM public.supplier_documents WHERE id='a4000000-0000-0000-0000-000000000001'$del$, :PROTECT::boolean);
SELECT public.retention_qa_probe('quote cascade contract', $del$DELETE FROM public.operation_quotes WHERE id='a2000000-0000-0000-0000-000000000001'$del$, :PROTECT::boolean);
SELECT public.retention_qa_probe('operation cascade contract', $del$DELETE FROM public.operations WHERE id='a0000000-0000-0000-0000-000000000001'$del$, :PROTECT::boolean);
SELECT public.retention_qa_probe('supplier cascade receipt', $del$DELETE FROM public.suppliers WHERE id='b1000000-0000-0000-0000-000000000001'$del$, :PROTECT::boolean);
SELECT public.retention_qa_probe('tenant cascade invoice', $del$DELETE FROM public.tenants WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc'$del$, :PROTECT::boolean);
SELECT count(*) AS probe_count FROM public.retention_qa_results;
