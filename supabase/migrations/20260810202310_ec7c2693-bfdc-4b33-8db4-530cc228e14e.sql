-- W08 HOTFIX DEF-W08-003 / DEF-W08-004: expiry validation + inbox expiry filtering.

CREATE OR REPLACE FUNCTION public.create_message(_tenant_id uuid, _title text, _body text, _kind message_kind DEFAULT 'operational'::message_kind, _priority message_priority DEFAULT 'normal'::message_priority, _locale text DEFAULT 'pt-BR'::text, _operation_id uuid DEFAULT NULL::uuid, _journey_step_id uuid DEFAULT NULL::uuid, _transport_leg_id uuid DEFAULT NULL::uuid, _hospitality_stay_id uuid DEFAULT NULL::uuid, _event_id uuid DEFAULT NULL::uuid, _event_session_id uuid DEFAULT NULL::uuid, _expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _msg public.messages; _prev jsonb; _result jsonb;
begin
  perform app_private.w08_require_comms_operator(_tenant_id);
  perform app_private.w08_assert_content_policy(_title, _body);

  if _expires_at is not null and _expires_at <= now() then
    raise exception 'A message expiry time must be in the future';
  end if;

  if _operation_id is not null
     and app_private.w08_tenant_of_operation(_operation_id) is distinct from _tenant_id then
    raise exception 'Operation not found in this organization';
  end if;

  if _idempotency_key is not null then
    begin
      insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
      values (_tenant_id, auth.uid(), 'w08.create_message', _idempotency_key, '{}'::jsonb);
    exception when unique_violation then
      select result into _prev from public.idempotency_keys
      where actor_profile_id = auth.uid() and action = 'w08.create_message'
        and idempotency_key = _idempotency_key;
      return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed', true);
    end;
  end if;

  perform set_config('app.w08_control','on', true);
  insert into public.messages
    (tenant_id, operation_id, kind, priority, status, title, body, locale, expires_at,
     journey_step_id, transport_leg_id, hospitality_stay_id, event_id, event_session_id, created_by)
  values (_tenant_id, _operation_id, _kind, _priority, 'draft', btrim(_title), btrim(_body),
          _locale, _expires_at, _journey_step_id, _transport_leg_id, _hospitality_stay_id,
          _event_id, _event_session_id, auth.uid())
  returning * into _msg;
  perform set_config('app.w08_control','off', true);

  perform app_private.w08_assert_source_operation_scope(_msg);

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'w08.message_created',
    'message', _msg.id, _idempotency_key,
    jsonb_build_object('kind', _kind, 'priority', _priority, 'operation_id', _operation_id));

  _result := jsonb_build_object('message_id', _msg.id, 'status', 'draft', 'replayed', false);
  if _idempotency_key is not null then
    update public.idempotency_keys set result = _result
    where actor_profile_id = auth.uid() and action = 'w08.create_message'
      and idempotency_key = _idempotency_key;
  end if;
  return _result;
end; $function$;

CREATE OR REPLACE FUNCTION public.update_draft_message(_message_id uuid, _title text DEFAULT NULL::text, _body text DEFAULT NULL::text, _kind message_kind DEFAULT NULL::message_kind, _priority message_priority DEFAULT NULL::message_priority, _locale text DEFAULT NULL::text, _expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _clear_expiry boolean DEFAULT false, _idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _msg public.messages;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);
  perform app_private.w08_assert_draft(_msg);
  perform app_private.w08_assert_content_policy(coalesce(_title,_msg.title), coalesce(_body,_msg.body));

  if not _clear_expiry and _expires_at is not null and _expires_at <= now() then
    raise exception 'A message expiry time must be in the future';
  end if;

  perform set_config('app.w08_control','on', true);
  update public.messages set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), title),
    body = coalesce(nullif(btrim(coalesce(_body,'')),''), body),
    kind = coalesce(_kind, kind),
    priority = coalesce(_priority, priority),
    locale = coalesce(_locale, locale),
    expires_at = case when _clear_expiry then null else coalesce(_expires_at, expires_at) end
  where id = _message_id
  returning * into _msg;
  perform set_config('app.w08_control','off', true);

  if _msg.status = 'scheduled' and _msg.expires_at is not null and _msg.scheduled_for >= _msg.expires_at then
    raise exception 'A message cannot expire before its scheduled time';
  end if;

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.draft_updated',
    'message', _msg.id, _idempotency_key, '{}'::jsonb);

  return jsonb_build_object('message_id', _msg.id, 'status', _msg.status, 'unchanged', false);
end; $function$;

CREATE OR REPLACE FUNCTION public.get_my_message_inbox(_tenant_id uuid, _limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _person uuid; _rows jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  _person := app_private.w08_current_person_id(_tenant_id);
  if _person is null then
    return jsonb_build_object('person_id', null, 'messages', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'priority', m.priority, 'status', m.status,
    'title', m.title, 'body', m.body, 'locale', m.locale,
    'operation_id', m.operation_id,
    'expires_at', m.expires_at,
    'published_at', m.published_at,
    'cancelled_at', m.cancelled_at,
    'delivered_at', d.delivered_at,
    'first_read_at', r.first_read_at
  ) order by m.published_at desc), '[]'::jsonb) into _rows
  from public.message_recipients r
  join public.messages m on m.id = r.message_id
  left join public.message_deliveries d on d.message_id = r.message_id and d.person_id = r.person_id
  where r.tenant_id = _tenant_id
    and r.person_id = _person
    and m.published_at is not null
    and (m.expires_at is null or m.expires_at > now());

  return jsonb_build_object('person_id', _person, 'messages', _rows);
end; $function$;