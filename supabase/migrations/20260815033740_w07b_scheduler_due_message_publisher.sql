create extension if not exists pg_cron;

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
         published_by = null,
         recipient_count = (select count(*) from public.message_recipients r where r.message_id = _message_id),
         in_app_reachable_count = (select count(*) from public.message_deliveries d where d.message_id = _message_id)
   where id = _message_id
   returning * into _msg;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, null, 'w07b.message_auto_published',
    'message', _message_id, _correlation,
    jsonb_build_object('recipient_count', _msg.recipient_count,
                       'in_app_reachable_count', _msg.in_app_reachable_count,
                       'scheduled_for', _msg.scheduled_for));

  _result := jsonb_build_object('message_id', _message_id, 'status', 'published', 'unchanged', false,
    'scheduler', true, 'summary', app_private.w08_message_delivery_summary(_message_id));
  return _result;
end;
$$;

revoke all on function app_private.w07b_publish_message_system(uuid) from public, anon, authenticated;

create or replace function app_private.w07b_process_due_messages(_batch_size integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _row record;
  _processed integer := 0;
  _published integer := 0;
  _cancelled integer := 0;
  _failed integer := 0;
  _result jsonb;
  _items jsonb := '[]'::jsonb;
begin
  for _row in
    select m.id
      from public.messages m
     where m.status = 'scheduled'
       and m.scheduled_for is not null
       and m.scheduled_for <= now()
     order by m.scheduled_for, m.id
     for update skip locked
     limit greatest(1, least(coalesce(_batch_size,50), 500))
  loop
    _processed := _processed + 1;
    begin
      _result := app_private.w07b_publish_message_system(_row.id);
      if _result->>'status' = 'published' then
        _published := _published + 1;
      elsif _result->>'status' = 'cancelled' then
        _cancelled := _cancelled + 1;
      end if;
      _items := _items || jsonb_build_array(_result);
    exception when others then
      _failed := _failed + 1;
      _items := _items || jsonb_build_array(jsonb_build_object(
        'message_id', _row.id,
        'status', 'failed',
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'processed', _processed,
    'published', _published,
    'cancelled', _cancelled,
    'failed', _failed,
    'items', _items
  );
end;
$$;

revoke all on function app_private.w07b_process_due_messages(integer) from public, anon, authenticated;

select cron.schedule(
  'cobs-w07b-publish-due-messages',
  '* * * * *',
  $$select app_private.w07b_process_due_messages(50);$$
)
where not exists (
  select 1 from cron.job where jobname = 'cobs-w07b-publish-due-messages'
);