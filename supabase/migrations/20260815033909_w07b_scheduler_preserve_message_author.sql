create or replace function app_private.w07b_publish_message_system(_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _msg public.messages;
  _correlation text := gen_random_uuid()::text;
  _people uuid[];
  _eligible uuid[];
  _recipients int := 0;
  _delivered int := 0;
  _result jsonb;
begin
  select * into _msg
  from public.messages
  where id = _message_id
  for update;

  if _msg.id is null then
    return jsonb_build_object('message_id', _message_id, 'status', 'missing', 'unchanged', true);
  end if;
  if _msg.status = 'published' then
    return jsonb_build_object('message_id', _message_id, 'status', 'published', 'unchanged', true,
      'summary', app_private.w08_message_delivery_summary(_message_id));
  end if;
  if _msg.status = 'cancelled' then
    return jsonb_build_object('message_id', _message_id, 'status', 'cancelled', 'unchanged', true);
  end if;
  if _msg.status <> 'scheduled' or _msg.scheduled_for is null or _msg.scheduled_for > now() then
    return jsonb_build_object('message_id', _message_id, 'status', _msg.status, 'unchanged', true,
      'reason', 'not_due');
  end if;

  if _msg.expires_at is not null and _msg.expires_at <= now() then
    perform set_config('app.w08_control','on', true);
    update public.messages
       set status = 'cancelled', cancelled_at = now(), cancelled_by = null,
           cancel_reason = 'Expired before scheduled publication'
     where id = _message_id;
    perform set_config('app.w08_control','off', true);

    perform app_private.record_audit_event(_msg.tenant_id, null, 'w07b.scheduled_message_expired',
      'message', _message_id, _correlation,
      jsonb_build_object('scheduled_for', _msg.scheduled_for, 'expires_at', _msg.expires_at));

    return jsonb_build_object('message_id', _message_id, 'status', 'cancelled', 'unchanged', false,
      'reason', 'expired');
  end if;

  if _msg.created_by is null then
    raise exception 'A scheduled message must retain its creator before automatic publication';
  end if;

  perform app_private.w08_assert_content_policy(_msg.title, _msg.body);
  perform app_private.w08_assert_source_operation_scope(_msg);

  select coalesce(array_agg(person_id), array[]::uuid[]) into _people
  from app_private.w08_resolve_audience(_msg);
  if coalesce(array_length(_people,1),0) = 0 then
    raise exception 'This scheduled message has no resolved audience';
  end if;

  perform app_private.w08_assert_explicit_people_in_operation(_msg,
    (select coalesce(array_agg(s.person_id), array[]::uuid[])
       from public.message_audience_selectors s
      where s.message_id = _message_id and s.selector_kind = 'explicit_person'));

  select coalesce(array_agg(person_id), array[]::uuid[]) into _eligible
  from app_private.w08_in_app_eligible_recipients(_msg.tenant_id, _msg.operation_id, _people);

  perform set_config('app.w08_control','on', true);
  insert into public.message_recipients (tenant_id, message_id, person_id, in_app_eligible)
  select _msg.tenant_id, _msg.id, p, p = any(_eligible)
  from unnest(_people) as t(p)
  on conflict do nothing;
  get diagnostics _recipients = row_count;
  perform set_config('app.w08_control','off', true);

  perform app_private.w08_record_communication_event(
    _msg, 'MESSAGE_PUBLISHED', null, null, null,
    jsonb_build_object('recipient_count',
      (select count(*) from public.message_recipients r where r.message_id = _message_id),
      'scheduler', true), _correlation);

  _delivered := app_private.w08_create_in_app_deliveries(_msg, _correlation);

  perform set_config('app.w08_control','on', true);
  update public.messages
     set status = 'published',
         published_at = now(),
         published_by = _msg.created_by,
         recipient_count = (select count(*) from public.message_recipients r where r.message_id = _message_id),
         in_app_reachable_count = (select count(*) from public.message_deliveries d where d.message_id = _message_id)
   where id = _message_id
   returning * into _msg;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, null, 'w07b.message_auto_published',
    'message', _message_id, _correlation,
    jsonb_build_object('recipient_count', _msg.recipient_count,
                       'in_app_reachable_count', _msg.in_app_reachable_count,
                       'scheduled_for', _msg.scheduled_for,
                       'message_creator_profile_id', _msg.created_by));

  _result := jsonb_build_object('message_id', _message_id, 'status', 'published', 'unchanged', false,
    'scheduler', true, 'summary', app_private.w08_message_delivery_summary(_message_id));
  return _result;
end;
$$;
revoke all on function app_private.w07b_publish_message_system(uuid) from public, anon, authenticated;