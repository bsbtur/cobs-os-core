CREATE OR REPLACE FUNCTION public.update_my_display_name(
  _display_name text,
  _idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _uid uuid := auth.uid();
  _clean text := nullif(btrim(coalesce(_display_name, '')), '');
  _profile public.profiles;
  _existing jsonb;
  _person record;
  _person_ids uuid[] := '{}';
  _changed boolean := false;
  _result jsonb;
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;
  if _idempotency_key is null then
    raise exception 'An idempotency key is required';
  end if;
  if _clean is null then
    raise exception 'A display name is required';
  end if;
  if char_length(_clean) > 120 then
    raise exception 'This display name is too long';
  end if;

  select k.result into _existing
  from public.idempotency_keys k
  where k.actor_profile_id = _uid
    and k.action = 'identity.display_name'
    and k.idempotency_key = _idempotency_key::text;
  if _existing is not null then
    return _existing;
  end if;

  select * into _profile from public.profiles p where p.id = _uid for update;
  if _profile.id is null then
    raise exception 'Authentication required';
  end if;

  if _profile.display_name is distinct from _clean then
    update public.profiles set display_name = _clean where id = _uid;
    _changed := true;
  end if;

  for _person in
    select * from public.people pe where pe.profile_id = _uid for update
  loop
    _person_ids := _person_ids || _person.id;
    if _person.full_name is distinct from _clean then
      update public.people set full_name = _clean where id = _person.id;
      _changed := true;
      perform app_private.record_audit_event(
        _person.tenant_id, _uid, 'identity.display_name_changed', 'person', _person.id, null,
        jsonb_build_object('profile_id', _uid, 'person_id', _person.id, 'changed', true)
      );
    end if;
  end loop;

  if not _changed then
    return jsonb_build_object('profile_id', _uid, 'person_ids', to_jsonb(_person_ids), 'unchanged', true);
  end if;

  if array_length(_person_ids, 1) is null then
    perform app_private.record_audit_event(
      null, _uid, 'identity.display_name_changed', 'profile', _uid, null,
      jsonb_build_object('profile_id', _uid, 'changed', true)
    );
  end if;

  _result := jsonb_build_object('profile_id', _uid, 'person_ids', to_jsonb(_person_ids), 'unchanged', false);

  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (null, _uid, 'identity.display_name', _idempotency_key::text, _result)
  on conflict (actor_profile_id, action, idempotency_key) do nothing;

  return _result;
end;
$$;

REVOKE ALL ON FUNCTION public.update_my_display_name(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_my_display_name(text, uuid) TO authenticated, service_role;