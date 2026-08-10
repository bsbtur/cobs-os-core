-- W08 HOTFIX DEF-W08-002: schedule_message must reject past timestamps.
CREATE OR REPLACE FUNCTION public.schedule_message(_message_id uuid, _scheduled_for timestamp with time zone, _idempotency_key text DEFAULT NULL::text)
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
  if _scheduled_for is null then raise exception 'A scheduled time is required'; end if;
  if _scheduled_for <= now() then raise exception 'A message can only be scheduled for a future time'; end if;
  if _msg.expires_at is not null and _scheduled_for >= _msg.expires_at then
    raise exception 'A message cannot be scheduled after its expiry time';
  end if;

  if _msg.status = 'scheduled' and _msg.scheduled_for = _scheduled_for then
    return jsonb_build_object('message_id', _message_id, 'status', 'scheduled', 'unchanged', true);
  end if;

  perform set_config('app.w08_control','on', true);
  update public.messages set status = 'scheduled', scheduled_for = _scheduled_for where id = _message_id;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.message_scheduled',
    'message', _message_id, _idempotency_key, jsonb_build_object('scheduled_for', _scheduled_for));
  return jsonb_build_object('message_id', _message_id, 'status', 'scheduled', 'unchanged', false);
end; $function$;