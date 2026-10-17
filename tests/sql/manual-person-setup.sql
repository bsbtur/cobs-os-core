-- Disposable test-only role and authorization shim (not deployable to Supabase).
create role authenticated nologin;
create type public.app_role as enum('owner','admin','operations_agent');
create or replace function app_private.has_tenant_role(_tenant uuid,_roles public.app_role[])
returns boolean language sql stable as $$
 select _tenant::text = current_setting('test.tenant',true)
 and current_setting('test.role',true) = any(_roles::text[])
$$;
select set_config('test.tenant','ffffffff-ffff-ffff-ffff-ffffffffffff',false);
select set_config('test.role','owner',false);
create unique index people_tenant_lower_email_test on public.people(tenant_id,lower(email)) where email is not null;
