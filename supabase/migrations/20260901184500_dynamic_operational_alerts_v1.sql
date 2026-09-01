-- Dynamic Operational Alerts V1
-- Governed, operation-scoped, in-app operational updates.

create or replace function public.publish_dynamic_operational_alert(
  _operation_id uuid,
  _alert_type text,
  _title text,
  _body text,
  _source_kind text,
  _source_id uuid,
  _idempotency_key text,
  _priority public.message_priority default 'important'::public.message_priority
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _op public.operations;
  _message_id uuid;
  _existing_id uuid;
  _people uuid[];
  _eligible uuid[];
  _recipient_count int := 0;
  _delivered int := 0;
  _correlation text := gen_random_uuid()::text;
  _metadata jsonb;
begin
  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  perform app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]);
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'Not authorized to publish operational alerts';
  end if;
  perform app_private.assert_operation_not_closed(_op.id);

  if _alert_type not in ('time_changed','location_changed','delay') then
    raise exception 'Unsupported operational alert type';
  end if;
  if nullif(btrim(coalesce(_title,'')),'') is null or nullif(btrim(coalesce(_body,'')),'') is null then
    raise exception 'Title and body are required';
  end if;
  if nullif(btrim(coalesce(_source_kind,'')),'') is null or _source_id is null then
    raise exception 'A canonical source is required';
  end if;
  if nullif(btrim(coalesce(_idempotency_key,'')),'') is null then
    raise exception 'An idempotency key is required';
  end if;
  perform app_private.w08_assert_content_policy(_title, _body);

  select m.id into _existing_id
  from public.messages m
  where m.tenant_id = _op.tenant_id
    and m.operation_id = _op.id
    and m.metadata->>'dynamic_operational_alert_key' = _idempotency_key
  order by m.created_at desc
  limit 1;
  if _existing_id is not null then
    return jsonb_build_object(
      'message_id', _existing_id,
      'operation_id', _op.id,
      'alert_type', _alert_type,
      'replayed', true,
      'summary', app_private.w08_message_delivery_summary(_existing_id)
    );
  end if;

  _metadata := jsonb_build_object(
    'dynamic_operational_alert', true,
    'dynamic_operational_alert_key', _idempotency_key,
    'alert_type', _alert_type,
    'source_kind', _source_kind,
    'source_id', _source_id,
    'correlation_id', _correlation
  );

  perform set_config('app.w08_control','on', true);
  insert into public.messages
    (tenant_id, operation_id, kind, priority, title, body, status, created_by,
     published_at, published_by, metadata)
  values
    (_op.tenant_id, _op.id, 'update'::public.message_kind, _priority,
     btrim(_title), btrim(_body), 'published', auth.uid(), now(), auth.uid(), _metadata)
  returning id into _message_id;

  insert into public.message_audience_selectors
    (tenant_id, message_id, selector_kind, created_by)
  values (_op.tenant_id, _message_id, 'all_participations', auth.uid());
  perform set_config('app.w08_control','off', true);

  select coalesce(array_agg(person_id), array[]::uuid[]) into _people
  from app_private.w08_resolve_audience((select m from public.messages m where m.id = _message_id));
  if coalesce(array_length(_people,1),0) = 0 then
    raise exception 'This operational alert has no resolved audience';
  end if;

  select coalesce(array_agg(person_id), array[]::uuid[]) into _eligible
  from app_private.w08_in_app_eligible_recipients(_op.tenant_id, _op.id, _people);

  perform set_config('app.w08_control','on', true);
  insert into public.message_recipients (tenant_id, message_id, person_id, in_app_eligible)
  select _op.tenant_id, _message_id, p, p = any(_eligible)
  from unnest(_people) as t(p)
  on conflict do nothing;
  perform set_config('app.w08_control','off', true);

  perform app_private.w08_record_communication_event(
    (select m from public.messages m where m.id = _message_id),
    'MESSAGE_PUBLISHED', null, null, null,
    jsonb_build_object('dynamic_operational_alert', true, 'alert_type', _alert_type),
    _correlation
  );

  _delivered := app_private.w08_create_in_app_deliveries(
    (select m from public.messages m where m.id = _message_id), _correlation
  );

  select count(*) into _recipient_count from public.message_recipients r where r.message_id = _message_id;
  perform set_config('app.w08_control','on', true);
  update public.messages set
    recipient_count = _recipient_count,
    in_app_reachable_count = _delivered
  where id = _message_id;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(
    _op.tenant_id, auth.uid(), 'operations.dynamic_alert_published', 'message', _message_id,
    _idempotency_key,
    jsonb_build_object('operation_id', _op.id, 'alert_type', _alert_type,
      'source_kind', _source_kind, 'source_id', _source_id,
      'recipient_count', _recipient_count, 'in_app_reachable_count', _delivered)
  );

  return jsonb_build_object(
    'message_id', _message_id,
    'operation_id', _op.id,
    'alert_type', _alert_type,
    'replayed', false,
    'recipient_count', _recipient_count,
    'in_app_reachable_count', _delivered,
    'summary', app_private.w08_message_delivery_summary(_message_id)
  );
end;
$function$;

revoke all on function public.publish_dynamic_operational_alert(uuid,text,text,text,text,uuid,text,public.message_priority) from public;
grant execute on function public.publish_dynamic_operational_alert(uuid,text,text,text,text,uuid,text,public.message_priority) to authenticated;
