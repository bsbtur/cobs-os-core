\set ON_ERROR_STOP on
-- Run only in a fresh, disposable PostgreSQL database.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA app_private;
CREATE TYPE public.app_role AS ENUM ('owner','admin','operations_agent','traveler');
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.operations (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.suppliers (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.operation_quotes (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  operation_id uuid NOT NULL REFERENCES public.operations(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id)
);
CREATE TABLE public.test_memberships (user_id uuid, tenant_id uuid, role public.app_role, PRIMARY KEY(user_id,tenant_id));
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE FUNCTION app_private.has_tenant_role(_tenant uuid,_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.test_memberships m
  WHERE m.user_id=auth.uid() AND m.tenant_id=_tenant AND m.role=ANY(_roles))
$$;
GRANT USAGE ON SCHEMA public,auth,app_private TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_role(uuid,public.app_role[]) TO authenticated;
\i supabase/migrations/20260906060000_consolidate_supplier_documents_v1.sql
\if :APPLY_GUARD
\i tests/security/patches/supplier-document-context-guard.candidate.sql
\endif
INSERT INTO public.tenants VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
INSERT INTO public.operations VALUES
 ('a0000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('a0000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('b0000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
INSERT INTO public.suppliers VALUES
 ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('b1000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
INSERT INTO public.operation_quotes VALUES
 ('a2000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),
 ('b2000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001');
INSERT INTO public.test_memberships VALUES
 ('a3000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner'),
 ('a3000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','operations_agent'),
 ('b3000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','owner');
INSERT INTO public.supplier_documents(id,tenant_id,operation_id,quote_id,supplier_id,document_type,title)
VALUES('b4000000-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','b0000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','contract','Foreign synthetic document');
-- Own-tenant target: agent may read this row but must not modify or delete it.
INSERT INTO public.supplier_documents(id,tenant_id,operation_id,quote_id,supplier_id,document_type,title)
VALUES('a4000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','contract','Own synthetic document');
-- Check simulated database role authorization and the real migration's policies/RPCs.
CREATE TABLE public.security_results (name text, passed boolean, detail text);
CREATE FUNCTION public.assert_rejected(_name text,_statement text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE ok boolean := false; err text;
BEGIN
 BEGIN
   EXECUTE _statement;
   ok := true;
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
 END;
 IF ok THEN RAISE EXCEPTION 'SECURITY FAILURE: % unexpectedly succeeded',_name; END IF;
 RAISE NOTICE 'PASS rejected: % (%)',_name,err;
END $$;
CREATE FUNCTION public.assert_allowed(_name text,_statement text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 EXECUTE _statement;
 RAISE NOTICE 'PASS allowed: %',_name;
END $$;
CREATE FUNCTION public.assert_zero_affected(_name text,_statement text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $zero$
DECLARE n integer;
BEGIN
 EXECUTE _statement;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'SECURITY FAILURE: % affected % rows',_name,n; END IF;
 RAISE NOTICE 'PASS zero affected: %',_name;
END $zero$;
GRANT EXECUTE ON FUNCTION public.assert_rejected(text,text),public.assert_allowed(text,text),public.assert_zero_affected(text,text) TO anon,authenticated;
SET ROLE anon;
SELECT public.assert_rejected('anon SELECT','SELECT * FROM public.supplier_documents');
SELECT public.assert_rejected('anon INSERT',$$INSERT INTO public.supplier_documents(tenant_id,operation_id,supplier_id,document_type,title) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','contract','x')$$);
SELECT public.assert_rejected('anon UPDATE','UPDATE public.supplier_documents SET title=''changed''');
SELECT public.assert_rejected('anon DELETE','DELETE FROM public.supplier_documents');
SELECT public.assert_rejected('anon RPC add',$$SELECT public.add_supplier_document('a2000000-0000-0000-0000-000000000001','contract','Anon')$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','c3000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
DO $$BEGIN
 IF (SELECT count(*) FROM public.supplier_documents) <> 0 THEN
   RAISE EXCEPTION 'nonmember saw documents';
 END IF;
END$$;
SELECT public.assert_zero_affected('nonmember UPDATE',$sql$UPDATE public.supplier_documents SET title='No access'$sql$);
SELECT public.assert_zero_affected('nonmember DELETE',$sql$DELETE FROM public.supplier_documents$sql$);
SELECT public.assert_rejected('nonmember RPC add',$$SELECT public.add_supplier_document('a2000000-0000-0000-0000-000000000001','contract','Other')$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
DO $agent_read$BEGIN
 IF (SELECT count(*) FROM public.supplier_documents WHERE id='a4000000-0000-0000-0000-000000000001') <> 1 THEN
  RAISE EXCEPTION 'SECURITY FAILURE: agent cannot read own-tenant document';
 END IF;
END$agent_read$;
SELECT public.assert_zero_affected('operations agent UPDATE own-tenant document',$sql$UPDATE public.supplier_documents SET title='Agent tampering' WHERE id='a4000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_zero_affected('operations agent DELETE own-tenant document',$sql$DELETE FROM public.supplier_documents WHERE id='a4000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_rejected('operations agent status RPC own-tenant',$sql$SELECT public.set_supplier_document_status('a4000000-0000-0000-0000-000000000001','approved')$sql$);
SELECT public.assert_zero_affected('operations agent UPDATE',$sql$UPDATE public.supplier_documents SET title='No agent edit' WHERE id='b4000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_zero_affected('operations agent DELETE',$sql$DELETE FROM public.supplier_documents WHERE id='b4000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_rejected('operations agent RPC add',$$SELECT public.add_supplier_document('a2000000-0000-0000-0000-000000000001','contract','Agent')$$);
SELECT public.assert_rejected('operations agent direct insert',$$INSERT INTO public.supplier_documents(tenant_id,operation_id,supplier_id,document_type,title) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','contract','Agent')$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT public.assert_allowed('owner RPC add',$$SELECT public.add_supplier_document('a2000000-0000-0000-0000-000000000001','contract','Valid contract')$$);
SELECT public.assert_rejected('owner accessing foreign quote',$$SELECT public.add_supplier_document('b2000000-0000-0000-0000-000000000001','contract','Foreign')$$);
-- This must fail if independent FKs permit cross-tenant or cross-operation references.
SELECT public.assert_rejected('cross-tenant operation direct insert',$$INSERT INTO public.supplier_documents(tenant_id,operation_id,supplier_id,document_type,title) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','contract','Cross tenant')$$);
SELECT public.assert_rejected('cross-tenant supplier direct insert',$$INSERT INTO public.supplier_documents(tenant_id,operation_id,supplier_id,document_type,title) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','contract','Cross supplier')$$);
SELECT public.assert_rejected('cross-operation quote direct insert',$$INSERT INTO public.supplier_documents(tenant_id,operation_id,quote_id,supplier_id,document_type,title) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','contract','Cross operation')$$);
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.supplier_documents WHERE tenant_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') THEN
  RAISE EXCEPTION 'foreign tenant leak';
 END IF;
END$$;
SELECT public.assert_rejected('foreign status via RPC',$$SELECT public.set_supplier_document_status('b4000000-0000-0000-0000-000000000001','approved')$$);
SELECT public.assert_zero_affected('owner A UPDATE foreign document',$sql$UPDATE public.supplier_documents SET title='No foreign edit' WHERE id='b4000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_zero_affected('owner A DELETE foreign document',$sql$DELETE FROM public.supplier_documents WHERE id='b4000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_rejected('owner A UPDATE operation to tenant B',$sql$UPDATE public.supplier_documents SET operation_id='b0000000-0000-0000-0000-000000000001' WHERE title='Valid contract'$sql$);
SELECT public.assert_rejected('owner A UPDATE supplier to tenant B',$sql$UPDATE public.supplier_documents SET supplier_id='b1000000-0000-0000-0000-000000000001' WHERE title='Valid contract'$sql$);
SELECT public.assert_rejected('owner A UPDATE quote to tenant B',$sql$UPDATE public.supplier_documents SET quote_id='b2000000-0000-0000-0000-000000000001' WHERE title='Valid contract'$sql$);
SELECT public.assert_rejected('owner A UPDATE operation to sibling A2 with stale quote',$sql$UPDATE public.supplier_documents SET operation_id='a0000000-0000-0000-0000-000000000002' WHERE title='Valid contract'$sql$);
SELECT public.assert_rejected('owner A UPDATE tenant to B',$sql$UPDATE public.supplier_documents SET tenant_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE title='Valid contract'$sql$);
SELECT public.assert_allowed('owner A UPDATE title',$sql$UPDATE public.supplier_documents SET title='Updated valid contract' WHERE title='Valid contract'$sql$);
SELECT public.assert_rejected('invalid document status',$$SELECT public.set_supplier_document_status((SELECT id FROM public.supplier_documents WHERE title='Updated valid contract' LIMIT 1),'invalid')$$);
SELECT public.assert_allowed('owner A DELETE own document',$sql$DELETE FROM public.supplier_documents WHERE title='Updated valid contract'$sql$);
RESET ROLE;
DO $block$BEGIN
 IF EXISTS(SELECT 1 FROM public.supplier_documents WHERE title='Updated valid contract') THEN
  RAISE EXCEPTION 'SECURITY FAILURE: authorized deletion did not remove row';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.supplier_documents WHERE id='a4000000-0000-0000-0000-000000000001' AND title='Own synthetic document' AND status='received') THEN
  RAISE EXCEPTION 'SECURITY FAILURE: agent changed or deleted own-tenant row';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.supplier_documents WHERE id='b4000000-0000-0000-0000-000000000001') THEN
  RAISE EXCEPTION 'SECURITY FAILURE: foreign document unexpectedly deleted';
 END IF;
END$block$;
-- Bidirectional referential safety: parent changes cannot orphan existing supplier documents.
-- These tests use the disposable DB owner so the result checks database integrity, not UI permissions.
SELECT public.assert_rejected('parent quote changes operation with linked document',$sql$UPDATE public.operation_quotes SET operation_id='a0000000-0000-0000-0000-000000000002' WHERE id='a2000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_rejected('parent quote changes tenant with linked document',$sql$UPDATE public.operation_quotes SET tenant_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE id='a2000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_rejected('parent quote changes supplier with linked document',$sql$UPDATE public.operation_quotes SET supplier_id='b1000000-0000-0000-0000-000000000001' WHERE id='a2000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_rejected('parent operation changes tenant with linked document',$sql$UPDATE public.operations SET tenant_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE id='a0000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_rejected('parent supplier changes tenant with linked document',$sql$UPDATE public.suppliers SET tenant_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE id='a1000000-0000-0000-0000-000000000001'$sql$);
-- Verify existing ON DELETE CASCADE behavior in the canonical supplier document migration.
-- Each savepoint keeps subsequent checks independent; never touches non-synthetic data.
SAVEPOINT cascade_quote;
DELETE FROM public.operation_quotes WHERE id='b2000000-0000-0000-0000-000000000001';
DO $cascade$BEGIN
 IF EXISTS(SELECT 1 FROM public.supplier_documents WHERE id='b4000000-0000-0000-0000-000000000001')
 THEN RAISE EXCEPTION 'SECURITY FAILURE: quote cascade did not remove linked document'; END IF;
 RAISE NOTICE 'PASS cascade: quote deletion removes document';
END$cascade$;
ROLLBACK TO SAVEPOINT cascade_quote;
-- Parent quote FKs are RESTRICT/NO ACTION in the minimal canonical fixture.
-- Operation and supplier deletions must therefore be blocked while quotes exist.
SELECT public.assert_rejected('operation delete blocked by dependent quote',$sql$DELETE FROM public.operations WHERE id='b0000000-0000-0000-0000-000000000001'$sql$);
SELECT public.assert_rejected('supplier delete blocked by dependent quote',$sql$DELETE FROM public.suppliers WHERE id='b1000000-0000-0000-0000-000000000001'$sql$);

ROLLBACK;
