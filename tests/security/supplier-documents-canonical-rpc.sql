\set ON_ERROR_STOP on
-- Disposable Postgres ONLY. Canonical RPCs are loaded from versioned migration files.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA app_private;
CREATE TYPE public.app_role AS ENUM ('owner','admin','operations_agent','traveler');
CREATE TABLE public.tenants(id uuid primary key);
CREATE TABLE public.profiles(id uuid primary key);
CREATE TABLE public.test_memberships(user_id uuid,tenant_id uuid,role public.app_role,PRIMARY KEY(user_id,tenant_id));
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $f$;
CREATE FUNCTION app_private.has_tenant_role(t uuid,rs public.app_role[])
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $f$
 SELECT EXISTS(SELECT 1 FROM public.test_memberships m WHERE m.user_id=auth.uid() AND m.tenant_id=t AND m.role=ANY(rs)) $f$;
-- Mirror the existing canonical operation mutation boundary from w02 migration.
CREATE FUNCTION app_private.op_control_active() RETURNS boolean
LANGUAGE sql STABLE AS $f$ SELECT coalesce(current_setting('app.op_control',true),'off')='on' $f$;
CREATE FUNCTION public.guard_operation_mutation() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
 IF app_private.op_control_active() THEN RETURN NEW; END IF;
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
  RAISE EXCEPTION 'An operation cannot be moved between organizations';
 END IF;
 RETURN NEW;
END $f$;
CREATE TABLE public.operations(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TRIGGER operations_guard BEFORE UPDATE ON public.operations
FOR EACH ROW EXECUTE FUNCTION public.guard_operation_mutation();
CREATE TABLE public.suppliers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 name text NOT NULL,category text,updated_at timestamptz DEFAULT now(),
 UNIQUE(tenant_id,name)
);
CREATE TABLE public.operation_quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
 supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
 category text NOT NULL,description text NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>=0),
 status text NOT NULL DEFAULT 'quoted',valid_until date,cancellation_terms text,notes text,
 selected_at timestamptz,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.quote_payment_schedule(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 quote_id uuid NOT NULL REFERENCES public.operation_quotes(id) ON DELETE CASCADE,
 installment_no integer NOT NULL,due_date date NOT NULL,amount_minor bigint NOT NULL,
 status text NOT NULL DEFAULT 'planned',paid_at timestamptz,notes text,
 UNIQUE(quote_id,installment_no)
);
CREATE FUNCTION app_private.record_audit_event(uuid,uuid,text,text,uuid,jsonb,jsonb)
RETURNS void LANGUAGE plpgsql AS $f$ BEGIN RETURN; END $f$;
GRANT USAGE ON SCHEMA public,auth,app_private TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_role(uuid,public.app_role[]) TO authenticated;
-- Load complete canonical function definitions, not a rewritten approximation.
\i supabase/migrations/20260906050000_consolidate_procurement_v1.sql
\i supabase/migrations/20260906060000_consolidate_supplier_documents_v1.sql
\i tests/security/patches/supplier-document-context-guard.candidate.sql
INSERT INTO public.tenants VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO public.operations VALUES('a0000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO public.suppliers(id,tenant_id,name,category) VALUES
('a1000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Supplier Alpha','transport');
INSERT INTO public.operation_quotes(id,tenant_id,operation_id,supplier_id,category,description,amount_minor)
VALUES('a2000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','transport','Transport quote',50000);
INSERT INTO public.test_memberships VALUES('a3000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner');
SELECT set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
-- Control: same supplier must remain editable, preserving document linkage.
SELECT public.update_operation_quote('a2000000-0000-0000-0000-000000000001','Supplier Alpha','transport','Revised terms',55000);
RESET ROLE;
DO $assert$BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.operation_quotes WHERE id='a2000000-0000-0000-0000-000000000001' AND amount_minor=55000)
 THEN RAISE EXCEPTION 'SECURITY FAILURE: legitimate quote edit failed'; END IF;
 RAISE NOTICE 'PASS canonical RPC edits unlinked quote, same supplier';
END$assert$;
SET ROLE authenticated;
SELECT public.add_supplier_document('a2000000-0000-0000-0000-000000000001','contract','Synthetic contract');
RESET ROLE;
DO $assert$BEGIN
 IF (SELECT count(*) FROM public.supplier_documents WHERE quote_id='a2000000-0000-0000-0000-000000000001') <> 1
 THEN RAISE EXCEPTION 'SECURITY FAILURE: document not created'; END IF;
END$assert$;
-- With document attached, changing only price/description must still work.
SET ROLE authenticated;
SELECT public.update_operation_quote('a2000000-0000-0000-0000-000000000001','Supplier Alpha','transport','Edited linked quote',60000);
RESET ROLE;
DO $assert$BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.operation_quotes WHERE id='a2000000-0000-0000-0000-000000000001' AND amount_minor=60000)
 THEN RAISE EXCEPTION 'SECURITY FAILURE: harmless linked quote edit failed'; END IF;
 RAISE NOTICE 'PASS canonical RPC edits linked quote without changing supplier';
END$assert$;
-- Trigger must reject a supplier identity change on a quote with evidence attached.
CREATE FUNCTION public.qa_rejected_supplier_reassignment() RETURNS void LANGUAGE plpgsql AS $assert$
DECLARE rejected boolean:=false; error_detail text;
BEGIN
 BEGIN
  PERFORM public.update_operation_quote('a2000000-0000-0000-0000-000000000001','Supplier Beta','transport','Should fail',70000);
 EXCEPTION WHEN OTHERS THEN
  rejected:=true; GET STACKED DIAGNOSTICS error_detail=MESSAGE_TEXT;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'SECURITY FAILURE: linked quote supplier reassignment accepted'; END IF;
 IF error_detail <> 'supplier_document_quote_parent_mismatch' THEN
  RAISE EXCEPTION 'Unexpected rejection: %',error_detail;
 END IF;
 RAISE NOTICE 'PASS canonical RPC blocked supplier reassignment linked to document';
END$assert$;
GRANT EXECUTE ON FUNCTION public.qa_rejected_supplier_reassignment() TO authenticated;
SET ROLE authenticated;
SELECT public.qa_rejected_supplier_reassignment();
RESET ROLE;
DO $assert$BEGIN
 IF EXISTS(SELECT 1 FROM public.suppliers WHERE name='Supplier Beta') THEN
  RAISE EXCEPTION 'SECURITY FAILURE: failed RPC left new supplier';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.supplier_documents d
  JOIN public.operation_quotes q ON q.id=d.quote_id
  WHERE d.supplier_id=q.supplier_id AND d.tenant_id=q.tenant_id
  AND d.operation_id=q.operation_id AND q.amount_minor=60000) THEN
  RAISE EXCEPTION 'SECURITY FAILURE: failed RPC modified linked evidence';
 END IF;
 RAISE NOTICE 'PASS rolled-back supplier reassignment preserves quote and document';
END$assert$;
ROLLBACK;
