-- Guard commercial lead conversion against cross-person email / phone collisions.
-- Existing converted leads remain idempotent. No changes to leads, people, payments or grants on migration.
create or replace function public.convert_commercial_lead_to_person(_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _lead public.commercial_leads;
  _person public.people;
  _phone text;
  _digits text;
  _matched_ids uuid[];
  _matched_count integer;
  _email_mismatch boolean;
  _phone_mismatch boolean;
begin
  select * into _lead from public.commercial_leads where id = _lead_id for update;
  if _lead.id is null then raise exception 'Commercial lead not found'; end if;

  perform app_private.w09_require_commerce_manager(_lead.tenant_id);

  if _lead.converted_person_id is not null then
    select * into _person from public.people
     where id = _lead.converted_person_id and tenant_id = _lead.tenant_id
     for update;
    -- Historical links are immutable here: never relink or silently reuse
    -- an identity when the recorded details conflict or the person is missing.
    if _person.id is null then
      raise exception 'commercial_lead_historical_identity_review_required' using errcode = 'P0001';
    end if;
    _digits := regexp_replace(coalesce(_lead.phone,''), '\\D', '', 'g');
    _phone := case when length(_digits) between 7 and 15 then '+' || _digits else null end;
    if (nullif(lower(btrim(_lead.email)), '') is not null
          and nullif(lower(btrim(_person.email)), '') is not null
          and lower(btrim(_lead.email)) <> lower(btrim(_person.email)))
       or (_phone is not null and _person.phone_e164 is not null and _phone <> _person.phone_e164)
    then
      raise exception 'commercial_lead_historical_identity_review_required' using errcode = 'P0001';
    end if;
    -- A competing Person sharing the lead's email or phone also requires review.
    if exists (
      select 1 from public.people p
       where p.tenant_id = _lead.tenant_id
         and p.id <> _person.id
         and ((nullif(lower(btrim(_lead.email)), '') is not null
                and lower(btrim(p.email)) = lower(btrim(_lead.email)))
              or (_phone is not null and p.phone_e164 = _phone))
    ) then
      raise exception 'commercial_lead_historical_identity_review_required' using errcode = 'P0001';
    end if;
    return jsonb_build_object('lead_id',_lead.id,'person_id',_person.id,'created',false,'unchanged',true);
  end if;

  -- Serialize conversions with overlapping identity keys, including absent Person rows.
  -- Transaction-scoped locks keep retries safe without storing an extra identity table.
  if nullif(lower(btrim(_lead.email)), '') is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_lead.tenant_id::text || ':email:' || lower(btrim(_lead.email)), 0));
  end if;
  -- The phone lock uses normalized E.164 below; all converters acquire email first.

  _digits := regexp_replace(coalesce(_lead.phone,''), '\D', '', 'g');
  if length(_digits) between 7 and 15 then
    _phone := '+' || _digits;
  else
    _phone := null;
  end if;

  if _phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_lead.tenant_id::text || ':phone:' || _phone, 0));
  end if;

  -- Fail closed: email and phone must resolve to at most one compatible Person.
  -- Never silently favor an email match over a conflicting phone match.
  select array_agg(p.id order by p.id), count(*)::integer
    into _matched_ids, _matched_count
    from public.people p
   where p.tenant_id = _lead.tenant_id
     and (
       (nullif(lower(btrim(_lead.email)), '') is not null and lower(btrim(p.email)) = lower(btrim(_lead.email)))
       or (_phone is not null and p.phone_e164 = _phone)
     );

  if _matched_count > 1 then
    raise exception 'commercial_lead_identity_conflict' using errcode = 'P0001';
  end if;

  if _matched_count = 1 then
    select
      (nullif(lower(btrim(_lead.email)), '') is not null
        and nullif(lower(btrim(p.email)), '') is not null
        and lower(btrim(p.email)) <> lower(btrim(_lead.email))),
      (_phone is not null and p.phone_e164 is not null and p.phone_e164 <> _phone)
      into _email_mismatch, _phone_mismatch
      from public.people p
     where p.id = _matched_ids[1] and p.tenant_id = _lead.tenant_id;

    if coalesce(_email_mismatch, false) or coalesce(_phone_mismatch, false) then
      raise exception 'commercial_lead_identity_conflict' using errcode = 'P0001';
    end if;
  end if;

  select * into _person
    from public.people p
   where p.tenant_id = _lead.tenant_id
     and (
       (nullif(lower(btrim(_lead.email)),'') is not null and lower(btrim(p.email)) = lower(btrim(_lead.email)))
       or (_phone is not null and p.phone_e164 = _phone)
     )
   order by case when lower(btrim(p.email)) = lower(btrim(_lead.email)) then 0 else 1 end, p.created_at
   limit 1
   for update;

  if _person.id is null then
    insert into public.people(tenant_id,full_name,email,phone_e164,country_code,preferred_locale,notes)
    values (_lead.tenant_id,btrim(_lead.full_name),lower(btrim(_lead.email)),_phone,'BR','pt-BR','Criado a partir de lead comercial ' || _lead.id::text)
    returning * into _person;
  end if;

  update public.commercial_leads
     set converted_person_id = _person.id,
         converted_at = coalesce(converted_at, now()),
         status = 'converted',
         metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('converted_person_id',_person.id,'conversion_source','commercial_lead_to_person_v1')
   where id = _lead.id;

  perform app_private.record_audit_event(_lead.tenant_id,auth.uid(),'commercial.lead_converted','commercial_lead',_lead.id,null,jsonb_build_object('person_id',_person.id,'source',_lead.source,'campaign',_lead.campaign));

  return jsonb_build_object('lead_id',_lead.id,'person_id',_person.id,'created',(_person.created_at >= transaction_timestamp() - interval '1 second'),'unchanged',false);
end;
$$;


