-- Synthetic disposable PostgreSQL fixture. Never run against COBS.
create schema auth;
create schema app_private;
create or replace function auth.uid() returns uuid language sql stable as $$ select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
create table public.people (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
 full_name text, email text, phone_e164 text, country_code text,
 preferred_locale text, notes text, created_at timestamptz not null default now()
);
create table public.commercial_leads (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
 full_name text, email text, phone text, source text, campaign text,
 converted_person_id uuid, converted_at timestamptz, status text,
 metadata jsonb default '{}'::jsonb
);
create or replace function app_private.w09_require_commerce_manager(uuid)
returns void language plpgsql as $$ begin return; end $$;
create or replace function app_private.record_audit_event(uuid, uuid, text, text, uuid, text, jsonb)
returns void language plpgsql as $$ begin return; end $$;
insert into public.people(id,tenant_id,full_name,email,phone_e164)
values
('10000000-0000-0000-0000-000000000001','ffffffff-ffff-ffff-ffff-ffffffffffff','A','a@example.test','+5561991111111'),
('10000000-0000-0000-0000-000000000002','ffffffff-ffff-ffff-ffff-ffffffffffff','B','b@example.test','+5561992222222');
insert into public.commercial_leads(id,tenant_id,full_name,email,phone,source,campaign)
values
('20000000-0000-0000-0000-000000000001','ffffffff-ffff-ffff-ffff-ffffffffffff','A','a@example.test','+5561991111111','qa','fixture'),
('20000000-0000-0000-0000-000000000002','ffffffff-ffff-ffff-ffff-ffffffffffff','Collision','a@example.test','+5561992222222','qa','fixture'),
('20000000-0000-0000-0000-000000000003','ffffffff-ffff-ffff-ffff-ffffffffffff','Mismatch','wrong@example.test','+5561991111111','qa','fixture'),
('20000000-0000-0000-0000-000000000004','ffffffff-ffff-ffff-ffff-ffffffffffff','New','new@example.test','+5561993333333','qa','fixture'),
('20000000-0000-0000-0000-000000000005','ffffffff-ffff-ffff-ffff-ffffffffffff','Race A','race@example.test','+5561994444444','qa','fixture'),
('20000000-0000-0000-0000-000000000006','ffffffff-ffff-ffff-ffff-ffffffffffff','Race B','race@example.test','+5561994444444','qa','fixture');

-- Historical conversion fixtures: one compatible, one conflicting, one dangling.
insert into public.commercial_leads(id,tenant_id,full_name,email,phone,source,campaign,converted_person_id,status)
values
('20000000-0000-0000-0000-000000000007','ffffffff-ffff-ffff-ffff-ffffffffffff','Legacy valid','a@example.test','+5561991111111','qa','fixture','10000000-0000-0000-0000-000000000001','converted'),
('20000000-0000-0000-0000-000000000008','ffffffff-ffff-ffff-ffff-ffffffffffff','Legacy mismatch','b@example.test','+5561991111111','qa','fixture','10000000-0000-0000-0000-000000000001','converted'),
('20000000-0000-0000-0000-000000000009','ffffffff-ffff-ffff-ffff-ffffffffffff','Legacy missing','absent@example.test','+5561995555555','qa','fixture','10000000-0000-0000-0000-000000000099','converted');
