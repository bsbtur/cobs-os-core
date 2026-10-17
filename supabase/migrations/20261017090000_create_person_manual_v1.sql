-- Manual person creation, deliberately separate from the commercial lead resolver.
create table if not exists app_private.manual_person_creation_requests(
 tenant_id uuid not null, idempotency_key text not null,
 payload_hash text not null, person_id uuid not null,
 primary key(tenant_id,idempotency_key)
);
revoke all on app_private.manual_person_creation_requests from public;

create or replace function public.create_person_manual(
 _tenant_id uuid, _full_name text, _email text, _phone_e164 text, _idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$
declare
 _name text := nullif(btrim(_full_name),'');
 _email_norm text := nullif(lower(btrim(_email)),'');
 _phone_norm text := nullif(btrim(_phone_e164),'');
 _key text := nullif(btrim(_idempotency_key),'');
 _hash text;
 _prior app_private.manual_person_creation_requests;
 _person_id uuid;
begin
 if _tenant_id is null or _name is null or length(_name)>200 or
    _key is null or length(_key)>150 then
   raise exception 'manual_person_invalid_input' using errcode='P0001';
 end if;
 -- Must match the owner/admin rule currently enforced by People INSERT RLS.
 if not app_private.has_tenant_role(_tenant_id,array['owner','admin']::public.app_role[]) then
   raise exception 'manual_person_unauthorized' using errcode='42501';
 end if;
 _hash := md5(_name || chr(0) || coalesce(_email_norm,'') || chr(0) || coalesce(_phone_norm,''));
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(_tenant_id::text || ':manual-request:' || _key,0)
 );
 select * into _prior from app_private.manual_person_creation_requests
 where tenant_id=_tenant_id and idempotency_key=_key for update;
 if found then
   if _prior.payload_hash <> _hash then
     raise exception 'manual_person_idempotency_conflict' using errcode='P0001';
   end if;
   return jsonb_build_object('person_id',_prior.person_id,'unchanged',true);
 end if;
 if _email_norm is not null then
   perform pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended(_tenant_id::text || ':email:' || _email_norm,0)
   );
   if exists(select 1 from public.people p
     where p.tenant_id=_tenant_id and lower(btrim(p.email))=_email_norm) then
     raise exception 'person_email_conflict_requires_review' using errcode='P0001';
   end if;
 end if;
 -- Phone is deliberately NOT a uniqueness key: families may share a contact.
 insert into public.people(tenant_id,full_name,email,phone_e164)
 values(_tenant_id,_name,_email_norm,_phone_norm)
 returning id into _person_id;
 insert into app_private.manual_person_creation_requests(tenant_id,idempotency_key,payload_hash,person_id)
 values(_tenant_id,_key,_hash,_person_id);
 return jsonb_build_object('person_id',_person_id,'unchanged',false);
exception
 when unique_violation then
   raise exception 'person_email_conflict_requires_review' using errcode='P0001';
end;
$$;
revoke all on function public.create_person_manual(uuid,text,text,text,text) from public;
grant execute on function public.create_person_manual(uuid,text,text,text,text) to authenticated;
