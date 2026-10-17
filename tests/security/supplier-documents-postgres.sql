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
GRANT EXECUTE ON FUNCTION public.assert_rejected(text,text),public.assert_allowed(text,text) TO anon,authenticated;
SET ROLE anon;
SELECT public.assert_rejected('anon SELECT','SELECT * FROM public.supplier_documents');
SELECT public.assert_rejected('anon INSERT',$$INSERT INTO public.supplier_documents(tenant_id,operation_id,supplier_id,document_type,title) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','contract','x')$$);
SELECT public.assert_rejected('anon RPC add',$$SELECT public.add_supplier_document('a2000000-0000-0000-0000-000000000001','contract','Anon')$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','c3000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
DO $$BEGIN
 IF (SELECT count(*) FROM public.supplier_documents) <> 0 THEN
   RAISE EXCEPTION 'nonmember saw documents';
 END IF;
END$$;
SELECT public.assert_rejected('nonmember RPC add',$$SELECT public.add_supplier_document('a2000000-0000-0000-0000-000000000001','contract','Other')$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
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
SELECT public.assert_rejected('invalid document status',$$SELECT public.set_supplier_document_status((SELECT id FROM public.supplier_documents WHERE title='Valid contract' LIMIT 1),'invalid')$$);
RESET ROLE;
ROLLBACK;
