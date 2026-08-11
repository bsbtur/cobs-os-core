CREATE OR REPLACE FUNCTION public.preview_audience_count(_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _msg public.messages; _people uuid[]; _eligible int;
begin
  select * into _msg from public.messages where id = _message_id;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);

  if _msg.published_at is not null then
    return app_private.w08_message_delivery_summary(_message_id) || jsonb_build_object('source','snapshot');
  end if;

  select coalesce(array_agg(person_id), array[]::uuid[]) into _people
  from app_private.w08_resolve_audience(_msg);
  select count(*) into _eligible
  from app_private.w08_in_app_eligible_recipients(_msg.tenant_id, _msg.operation_id, _people);

  return jsonb_build_object(
    'source','preview',
    'recipient_count', coalesce(array_length(_people,1),0),
    'in_app_reachable_count', _eligible,
    'unreachable_count', coalesce(array_length(_people,1),0) - _eligible,
    'read_count', 0);
end; $function$;