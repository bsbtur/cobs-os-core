-- Canonical lead-side identity resolver. Private and permissioned by the caller.
-- Phone is a contact attribute, NEVER a standalone identity key.
create or replace function app_private.resolve_commercial_lead_person(
  _tenant_id uuid, _full_name text, _email text, _phone text, _lead_id uuid
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  _normalized_email text := nullif(lower(btrim(_email)), '');
  _digits text := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  _normalized_phone text;
  _matches uuid[];
  _person public.people;
begin
  -- Private helper: validate the calling lead and enforce its tenant authorization.
  if not exists (
    select 1 from public.commercial_leads l
    where l.id = _lead_id and l.tenant_id = _tenant_id
      and l.converted_person_id is null
  ) then raise exception 'commercial_lead_identity_review_required' using errcode='P0001'; end if;
  perform app_private.w09_require_commerce_manager(_tenant_id);
  if _normalized_email is null then
    raise exception 'commercial_lead_identity_review_required' using errcode='P0001';
  end if;
  _normalized_phone := case when length(_digits) between 7 and 15 then '+' || _digits else null end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(_tenant_id::text || ':email:' || _normalized_email, 0)
  );

  select array_agg(p.id order by p.id) into _matches
  from public.people p
  where p.tenant_id = _tenant_id and lower(btrim(p.email)) = _normalized_email;

  if coalesce(array_length(_matches,1),0) > 1 then
    raise exception 'commercial_lead_identity_conflict' using errcode='P0001';
  end if;
  if coalesce(array_length(_matches,1),0) = 1 then
    select * into _person from public.people
    where id=_matches[1] and tenant_id=_tenant_id for update;
    if _normalized_phone is not null and _person.phone_e164 is not null
       and _person.phone_e164 <> _normalized_phone then
      raise exception 'commercial_lead_identity_conflict' using errcode='P0001';
    end if;
    return _person.id;
  end if;

  -- Matching a phone without a matching email is NOT proof of common identity.
  -- Do not silently create another Person where the phone is in use:
  -- conflicting or shared contacts require an explicit human review for leads.
  if _normalized_phone is not null and exists (
    select 1 from public.people p
    where p.tenant_id = _tenant_id and p.phone_e164 = _normalized_phone
  ) then raise exception 'commercial_lead_identity_conflict' using errcode='P0001'; end if;

  insert into public.people(tenant_id,full_name,email,phone_e164,country_code,preferred_locale,notes)
  values(_tenant_id,btrim(_full_name),_normalized_email,_normalized_phone,'BR','pt-BR',
    'Criado a partir de lead comercial ' || _lead_id::text)
  returning id into _person.id;
  return _person.id;
end;
$$;
revoke all on function app_private.resolve_commercial_lead_person(uuid,text,text,text,uuid) from public, anon, authenticated;
