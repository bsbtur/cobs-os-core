-- W08 HOTFIX DEF-W08-005: cannot publish an already-expired message.
CREATE OR REPLACE FUNCTION public.publish_message(_message_id uuid, _idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _msg public.messages;
  _prev jsonb;
  _correlation text := gen_random_uuid()::text;
  _people uuid[];
  _eligible uuid[];
  _recipients int := 0;
  _delivered int := 0;
  _result jsonb;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);

  if _msg.status = 'published' then
    return jsonb_build_object('message_id', _message_id, 'status', 'published',
      'unchanged', true,
      'summary', app_private.w08_message_delivery_summary(_message_id));
  end if;
  if _msg.status = 'cancelled' then raise exception 'A cancelled message cannot be published'; end if;
  if _msg.expires_at is not null and _msg.expires_at <= now() then
    raise exception 'This message has already expired and cannot be published';
  end if;

  perform app_private.w08_assert_content_policy(_msg.title, _msg.body);
  perform app_private.w08_assert_source_operation_scope(_msg);

  select coalesce(array_agg(person_id), array[]::uuid[]) into _people
  from app_private.w08_resolve_audience(_msg);

  if coalesce(array_length(_people,1),0) = 0 then
    raise exception 'This message has no resolved audience';
  end if;

  perform app_private.w08_assert_explicit_people_in_operation(_msg,
    (select coalesce(array_agg(s.person_id), array[]::uuid[])
     from public.message_audience_selectors s
     where s.message_id = _message_id and s.selector_kind = 'explicit_person'));

  if _idempotency_key is not null then
    begin
      insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
      values (_msg.tenant_id, auth.uid(), 'w08.publish_message', _idempotency_key, '{}'::jsonb);
    exception when unique_violation then
      select result into _prev from public.idempotency_keys
      where actor_profile_id = auth.uid() and action = 'w08.publish_message'
        and idempotency_key = _idempotency_key;
      return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed', true);
    end;
  end if;

  select coalesce(array_agg(person_id), array[]::uuid[]) into _eligible
  from app_private.w08_in_app_eligible_recipients(_msg.tenant_id, _people);

  perform set_config('app.w08_control','on', true);
  insert into public.message_recipients (tenant_id, message_id, person_id, in_app_eligible)
  select _msg.tenant_id, _msg.id, p, p = any(_eligible)
  from unnest(_people) as t(p);
  get diagnostics _recipients = row_count;
  perform set_config('app.w08_control','off', true);

  perform app_private.w08_record_communication_event(
    _msg, 'MESSAGE_PUBLISHED', null, null, null,
    jsonb_build_object('recipient_count', _recipients), _correlation);

  _delivered := app_private.w08_create_in_app_deliveries(_msg, _correlation);

  perform set_config('app.w08_control','on', true);
  update public.messages set
    status = 'published',
    published_at = now(),
    published_by = auth.uid(),
    recipient_count = _recipients,
    in_app_reachable_count = _delivered
  where id = _message_id
  returning * into _msg;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.message_published',
    'message', _message_id, coalesce(_idempotency_key, _correlation),
    jsonb_build_object('recipient_count', _recipients, 'in_app_reachable_count', _delivered));

  _result := jsonb_build_object('message_id', _message_id, 'status', 'published', 'unchanged', false,
    'summary', app_private.w08_message_delivery_summary(_message_id));

  if _idempotency_key is not null then
    update public.idempotency_keys set result = _result
    where actor_profile_id = auth.uid() and action = 'w08.publish_message'
      and idempotency_key = _idempotency_key;
  end if;
  return _result;
end; $function$;