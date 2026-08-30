alter table public.commercial_leads
  add column if not exists converted_person_id uuid references public.people(id) on delete set null;

alter table public.commercial_leads
  add column if not exists converted_at timestamptz;

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
  _created boolean := false;
begin
  select *
    into _lead
    from public.commercial_leads
   where id = _lead_id
   for update;

  if _lead.id is null then
    raise exception 'Commercial lead not found';
  end if;

  perform app_private.w09_require_commerce_manager(_lead.tenant_id);

  if _lead.converted_person_id is not null then
    select *
      into _person
      from public.people
     where id = _lead.converted_person_id
       and tenant_id = _lead.tenant_id;

    if _person.id is not null then
      return jsonb_build_object(
        'lead_id', _lead.id,
        'person_id', _person.id,
        'created', false,
        'unchanged', true
      );
    end if;
  end if;

  _digits := regexp_replace(coalesce(_lead.phone, ''), '\D', '', 'g');
  if length(_digits) between 7 and 15 then
    _phone := '+' || _digits;
  else
    _phone := null;
  end if;

  select *
    into _person
    from public.people p
   where p.tenant_id = _lead.tenant_id
     and (
       (nullif(lower(btrim(_lead.email)), '') is not null
        and lower(btrim(p.email)) = lower(btrim(_lead.email)))
       or (_phone is not null and p.phone_e164 = _phone)
     )
   order by
     case when lower(btrim(p.email)) = lower(btrim(_lead.email)) then 0 else 1 end,
     p.created_at
   limit 1
   for update;

  if _person.id is null then
    insert into public.people(
      tenant_id,
      full_name,
      email,
      phone_e164,
      country_code,
      preferred_locale,
      notes
    )
    values (
      _lead.tenant_id,
      btrim(_lead.full_name),
      lower(btrim(_lead.email)),
      _phone,
      'BR',
      'pt-BR',
      'Criado a partir de lead comercial ' || _lead.id::text
    )
    returning * into _person;

    _created := true;
  end if;

  update public.commercial_leads
     set converted_person_id = _person.id,
         converted_at = coalesce(converted_at, now()),
         status = 'converted',
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'converted_person_id', _person.id,
           'conversion_source', 'commercial_lead_to_person_v1'
         )
   where id = _lead.id;

  perform app_private.record_audit_event(
    _lead.tenant_id,
    auth.uid(),
    'commercial.lead_converted',
    'commercial_lead',
    _lead.id,
    null,
    jsonb_build_object(
      'person_id', _person.id,
      'source', _lead.source,
      'campaign', _lead.campaign
    )
  );

  return jsonb_build_object(
    'lead_id', _lead.id,
    'person_id', _person.id,
    'created', _created,
    'unchanged', false
  );
end;
$$;

revoke all on function public.convert_commercial_lead_to_person(uuid) from public;
grant execute on function public.convert_commercial_lead_to_person(uuid) to authenticated;
