create or replace function public.update_person(
  _person_id uuid,
  _changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _uid uuid := auth.uid();
  _person public.people;
  _before jsonb;
  _after jsonb;
  _unknown_keys text[];
  _full_name text;
  _email text;
  _phone text;
  _locale text;
  _notes text;
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;

  if _changes is null or jsonb_typeof(_changes) <> 'object' then
    raise exception 'Changes must be a JSON object';
  end if;

  select array_agg(k order by k)
    into _unknown_keys
  from jsonb_object_keys(_changes) as k
  where k not in ('full_name','email','phone_e164','preferred_locale','notes');

  if _unknown_keys is not null then
    raise exception 'Unsupported person fields: %', array_to_string(_unknown_keys, ', ');
  end if;

  select * into _person
  from public.people p
  where p.id = _person_id
  for update;

  if _person.id is null then
    raise exception 'Person not found';
  end if;

  if not app_private.has_tenant_role(
    _person.tenant_id,
    array['owner','admin']::public.app_role[]
  ) then
    raise exception 'Only owners and admins can edit people';
  end if;

  _before := jsonb_build_object(
    'full_name', _person.full_name,
    'email', _person.email,
    'phone_e164', _person.phone_e164,
    'preferred_locale', _person.preferred_locale,
    'notes', _person.notes
  );

  _full_name := case
    when _changes ? 'full_name' then nullif(btrim(_changes->>'full_name'), '')
    else _person.full_name
  end;
  if _full_name is null then
    raise exception 'Full name is required';
  end if;

  _email := case
    when _changes ? 'email' then nullif(lower(btrim(_changes->>'email')), '')
    else _person.email
  end;
  if _email is not null and _email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email address';
  end if;

  _phone := case
    when _changes ? 'phone_e164' then nullif(btrim(_changes->>'phone_e164'), '')
    else _person.phone_e164
  end;
  if _phone is not null and _phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Phone must use E.164 format';
  end if;

  _locale := case
    when _changes ? 'preferred_locale' then nullif(btrim(_changes->>'preferred_locale'), '')
    else _person.preferred_locale
  end;

  _notes := case
    when _changes ? 'notes' then nullif(btrim(_changes->>'notes'), '')
    else _person.notes
  end;

  update public.people
     set full_name = _full_name,
         email = _email,
         phone_e164 = _phone,
         preferred_locale = _locale,
         notes = _notes,
         updated_at = now()
   where id = _person.id
   returning * into _person;

  _after := jsonb_build_object(
    'full_name', _person.full_name,
    'email', _person.email,
    'phone_e164', _person.phone_e164,
    'preferred_locale', _person.preferred_locale,
    'notes', _person.notes
  );

  if _before is distinct from _after then
    perform app_private.record_audit_event(
      _person.tenant_id,
      _uid,
      'person.updated',
      'person',
      _person.id,
      _before,
      _after
    );
  end if;

  return jsonb_build_object(
    'person_id', _person.id,
    'tenant_id', _person.tenant_id,
    'profile_id', _person.profile_id,
    'full_name', _person.full_name,
    'email', _person.email,
    'phone_e164', _person.phone_e164,
    'preferred_locale', _person.preferred_locale,
    'notes', _person.notes,
    'updated_at', _person.updated_at,
    'login_identity_unchanged', true
  );
end;
$function$;

revoke all on function public.update_person(uuid,jsonb) from public;
grant execute on function public.update_person(uuid,jsonb) to authenticated;

comment on function public.update_person(uuid,jsonb) is
'Owner/admin patch command for organization person identity/contact data. Person email is contact identity and never changes auth login credentials.';