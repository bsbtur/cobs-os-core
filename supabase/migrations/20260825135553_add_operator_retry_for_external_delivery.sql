create or replace function public.retry_communication_delivery(
  _outbox_id uuid,
  _idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _o public.communication_outbox;
  _prev jsonb;
  _result jsonb;
begin
  select * into _o
  from public.communication_outbox
  where id = _outbox_id
  for update;

  if _o.id is null then
    raise exception 'Outbox item not found';
  end if;

  perform app_private.w08_require_comms_operator(_o.tenant_id);

  if _o.status not in ('failed','dead_letter') then
    raise exception 'Only failed or dead-letter deliveries can be manually retried';
  end if;

  if _idempotency_key is not null then
    begin
      insert into public.idempotency_keys(tenant_id, actor_profile_id, action, idempotency_key, result)
      values (_o.tenant_id, auth.uid(), 'w07b.retry_communication_delivery', _idempotency_key, '{}'::jsonb);
    exception when unique_violation then
      select result into _prev
      from public.idempotency_keys
      where actor_profile_id = auth.uid()
        and action = 'w07b.retry_communication_delivery'
        and idempotency_key = _idempotency_key;
      return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed', true);
    end;
  end if;

  update public.communication_outbox
  set status = 'queued',
      next_attempt_at = now(),
      claimed_at = null,
      provider_key = null,
      provider_message_id = null,
      accepted_at = null,
      sent_at = null,
      delivered_at = null,
      read_at = null,
      failed_at = null,
      dead_lettered_at = null,
      last_error_code = null,
      last_error_message = null,
      updated_at = now()
  where id = _outbox_id;

  perform app_private.record_audit_event(
    _o.tenant_id,
    auth.uid(),
    'w07b.delivery_retry_requested',
    'communication_outbox',
    _outbox_id,
    coalesce(_idempotency_key, gen_random_uuid()::text),
    jsonb_build_object('previous_status', _o.status, 'channel', _o.channel, 'attempt_count', _o.attempt_count)
  );

  _result := jsonb_build_object(
    'outbox_id', _outbox_id,
    'status', 'queued',
    'previous_status', _o.status,
    'attempt_count', _o.attempt_count,
    'unchanged', false
  );

  if _idempotency_key is not null then
    update public.idempotency_keys
    set result = _result
    where actor_profile_id = auth.uid()
      and action = 'w07b.retry_communication_delivery'
      and idempotency_key = _idempotency_key;
  end if;

  return _result;
end;
$function$;

revoke all on function public.retry_communication_delivery(uuid,text) from public, anon;
grant execute on function public.retry_communication_delivery(uuid,text) to authenticated;