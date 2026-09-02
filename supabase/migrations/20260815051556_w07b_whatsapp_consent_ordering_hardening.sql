create sequence if not exists public.whatsapp_consent_event_seq;
alter table public.whatsapp_consent_events add column if not exists sequence_no bigint;
update public.whatsapp_consent_events set sequence_no=nextval('public.whatsapp_consent_event_seq') where sequence_no is null;
alter table public.whatsapp_consent_events alter column sequence_no set default nextval('public.whatsapp_consent_event_seq');
alter table public.whatsapp_consent_events alter column sequence_no set not null;
create unique index if not exists whatsapp_consent_events_sequence_uq on public.whatsapp_consent_events(sequence_no);
drop index if exists public.whatsapp_consent_events_current_idx;
create index whatsapp_consent_events_current_idx on public.whatsapp_consent_events(tenant_id,person_id,sequence_no desc);
create or replace function app_private.w07b_current_whatsapp_consent(_tenant_id uuid,_person_id uuid)
returns public.whatsapp_consent_action language sql stable security definer set search_path='pg_catalog','public' as $$
  select e.action from public.whatsapp_consent_events e
  where e.tenant_id=_tenant_id and e.person_id=_person_id
  order by e.sequence_no desc limit 1
$$;
revoke all on function app_private.w07b_current_whatsapp_consent(uuid,uuid) from public,anon,authenticated;