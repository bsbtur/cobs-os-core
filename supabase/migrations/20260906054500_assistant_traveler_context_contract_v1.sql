create or replace function app_private.assistant_build_traveler_payment_context(
  _tenant_id uuid,
  _operation_id uuid,
  _profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _payment jsonb := app_private.assistant_build_payment_context(_tenant_id,_operation_id,_profile_id);
  _charge jsonb;
  _next jsonb := '{}'::jsonb;
begin
  if coalesce(_payment,'{}'::jsonb) = '{}'::jsonb then
    return '{}'::jsonb;
  end if;

  for _charge in
    select value
    from jsonb_array_elements(coalesce(_payment->'charges','[]'::jsonb))
  loop
    if coalesce(_charge->>'status','') not in ('paid','cancelled')
       and coalesce((_charge->>'amount')::numeric,0) > coalesce((_charge->>'paid_amount')::numeric,0)
    then
      _next := jsonb_strip_nulls(jsonb_build_object(
        'amount', greatest(coalesce((_charge->>'amount')::numeric,0) - coalesce((_charge->>'paid_amount')::numeric,0),0),
        'due_date', nullif(_charge->>'due_date',''),
        'installment_number', case when nullif(_charge->>'installment_number','') is not null then (_charge->>'installment_number')::integer else null end,
        'installment_count', case when nullif(_charge->>'installment_count','') is not null then (_charge->>'installment_count')::integer else null end
      ));
      exit;
    end if;
  end loop;

  return jsonb_strip_nulls(jsonb_build_object(
    'currency',_payment->>'currency',
    'amount_unit','major',
    'order_total',_payment->'order_total',
    'paid_total',_payment->'paid_total',
    'refunded_total',_payment->'refunded_total',
    'net_paid',_payment->'net_paid',
    'balance_due',_payment->'balance_due',
    'payment_status',_payment->>'payment_status',
    'next_installment',case when _next='{}'::jsonb then null else _next end,
    'instruction','These monetary fields are authoritative backend-calculated values in major currency units. Never recalculate, rescale, infer, or replace them from conversation history.'
  ));
end;
$$;

revoke all on function app_private.assistant_build_traveler_payment_context(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function app_private.assistant_build_traveler_payment_context(uuid,uuid,uuid) to postgres;

create or replace function public.assistant_submit_message(
  _conversation_id uuid,
  _message text,
  _human_available boolean default false,
  _idempotency_key text default null::text
)
returns table(message_id uuid, automation_event_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _c public.assistant_conversations%rowtype;
  _message_id uuid;
  _event_id uuid;
  _idem text;
  _person_id uuid;
  _person_name text;
  _timezone text := 'UTC';
  _trusted_context jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if _message is null or length(btrim(_message))<1 or length(_message)>2000 then raise exception 'invalid_message'; end if;

  select * into _c from public.assistant_conversations where id=_conversation_id;
  if _c.id is null then raise exception 'conversation_not_found'; end if;
  if _c.profile_id<>auth.uid() then raise exception 'assistant_access_denied'; end if;
  if _c.status<>'open' then raise exception 'conversation_closed'; end if;
  if not app_private.assistant_has_operation_access(_c.tenant_id,_c.operation_id,_c.profile_id) then raise exception 'operation_access_denied'; end if;

  select g.person_id,p.full_name
  into _person_id,_person_name
  from public.participant_access_grants g
  left join public.people p on p.id=g.person_id and p.tenant_id=g.tenant_id
  where g.tenant_id=_c.tenant_id
    and g.operation_id=_c.operation_id
    and g.profile_id=_c.profile_id
    and g.status::text='active'
    and g.revoked_at is null
  order by g.activated_at desc nulls last,g.granted_at desc
  limit 1;

  select coalesce(nullif(o.timezone,''),'UTC') into _timezone
  from public.operations o
  where o.id=_c.operation_id and o.tenant_id=_c.tenant_id;

  _trusted_context:=app_private.assistant_localize_trusted_context(
    app_private.assistant_build_trusted_context(_c.tenant_id,_c.operation_id,_c.profile_id)
  );
  _trusted_context:=jsonb_set(
    _trusted_context,
    '{reservation}',
    app_private.assistant_build_reservation_context(_c.tenant_id,_c.operation_id,_c.profile_id),
    true
  );
  _trusted_context:=jsonb_set(
    _trusted_context,
    '{payment}',
    app_private.assistant_build_traveler_payment_context(_c.tenant_id,_c.operation_id,_c.profile_id),
    true
  );
  _trusted_context:=jsonb_set(
    _trusted_context,
    '{identity}',
    jsonb_strip_nulls(jsonb_build_object('traveler_name',_person_name)),
    true
  );
  _trusted_context:=jsonb_set(
    _trusted_context,
    '{runtime}',
    jsonb_build_object(
      'timezone',_timezone,
      'current_datetime_local',to_char(clock_timestamp() at time zone _timezone,'YYYY-MM-DD HH24:MI:SS') || ' ' || _timezone,
      'current_date_local',to_char(clock_timestamp() at time zone _timezone,'YYYY-MM-DD'),
      'current_time_local',to_char(clock_timestamp() at time zone _timezone,'HH24:MI:SS')
    ),
    true
  );
  _trusted_context:=jsonb_set(
    _trusted_context,
    '{answer_contract}',
    jsonb_build_object(
      'confirmed_facts_only',true,
      'missing_fact_response','Essa informação ainda não foi confirmada pela organização.',
      'conflict_rule','If facts conflict or more than one value could answer the question, do not choose a value. Say the information is not yet safely confirmed.',
      'known_identity_rule','Never ask the traveler for operation, order, reservation, participant or profile identifiers that are already resolved by the authenticated session.',
      'financial_rule','Use payment fields exactly as provided by the backend. Never perform monetary arithmetic, scaling, inference or reconciliation in the language model.',
      'privacy_rule','Do not expose UUIDs, internal field names, raw technical statuses, UTC timestamps or implementation details to the traveler.',
      'time_rule','Use runtime.current_datetime_local for relative-date questions and operation.timezone for all trip times.',
      'schedule_rule','planned values are planning/baseline values, not confirmation. expected or explicitly published traveler-facing values may be described only with their actual confidence.'
    ),
    true
  );

  insert into public.assistant_conversation_messages(conversation_id,tenant_id,role,content,status)
  values(_c.id,_c.tenant_id,'user',btrim(_message),'completed')
  returning id into _message_id;

  _idem:=coalesce(nullif(btrim(_idempotency_key),''),'assistant.request:'||_message_id::text);

  insert into public.automation_events(
    tenant_id,operation_id,actor_profile_id,event_type,source,idempotency_key,correlation_id,payload,dispatch_status
  )
  values(
    _c.tenant_id,_c.operation_id,_c.profile_id,'assistant.request','cobs_app',_idem,
    'assistant:'||_c.id::text||':'||_message_id::text,
    jsonb_build_object(
      'message',btrim(_message),
      'channel',_c.channel,
      'locale',_c.locale,
      'human_available',coalesce(_human_available,false),
      'conversation_id',_c.id::text,
      'person_id',_person_id,
      'context',_trusted_context
    ),
    'pending'
  )
  returning id into _event_id;

  update public.assistant_conversation_messages set automation_event_id=_event_id,status='pending' where id=_message_id;
  update public.assistant_conversations set human_available=coalesce(_human_available,false),last_message_at=now(),updated_at=now() where id=_c.id;

  return query select _message_id,_event_id;
end;
$$;

revoke all on function public.assistant_submit_message(uuid,text,boolean,text) from public, anon;
grant execute on function public.assistant_submit_message(uuid,text,boolean,text) to authenticated;
