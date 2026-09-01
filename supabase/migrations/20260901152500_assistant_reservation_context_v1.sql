-- Assistant Reservation Context V1
-- Adds only canonical, traveler-scoped reservation facts to assistant.request.

create or replace function app_private.assistant_build_reservation_context(
  _tenant_id uuid,
  _operation_id uuid,
  _profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  _person_id uuid;
  _reservation jsonb;
begin
  if not app_private.assistant_has_operation_access(_tenant_id, _operation_id, _profile_id) then
    raise exception 'operation_access_denied';
  end if;
  select g.person_id into _person_id from public.participant_access_grants g
  where g.tenant_id=_tenant_id and g.operation_id=_operation_id and g.profile_id=_profile_id
    and g.status::text='active' and g.revoked_at is null
  order by g.activated_at desc nulls last,g.granted_at desc limit 1;
  if _person_id is null then return '{}'::jsonb; end if;
  select jsonb_strip_nulls(jsonb_build_object(
    'status',r.status::text,'order_status',o.status::text,'package_name',oi.sellable_name_snapshot,
    'quantity',r.quantity,'confirmed_at',r.confirmed_at,
    'expires_at',case when r.status::text='reserved' then r.expires_at else null end
  )) into _reservation
  from public.commercial_reservations r
  join public.orders o on o.id=r.order_id and o.tenant_id=r.tenant_id
  join public.order_items oi on oi.id=r.order_item_id and oi.order_id=r.order_id and oi.tenant_id=r.tenant_id
  where r.tenant_id=_tenant_id and o.operation_id=_operation_id and oi.beneficiary_person_id=_person_id
    and r.status::text in ('confirmed','reserved') and o.status::text<>'cancelled'
  order by case r.status::text when 'confirmed' then 0 else 1 end,r.confirmed_at desc nulls last,r.created_at desc limit 1;
  return coalesce(_reservation,'{}'::jsonb);
end;
$$;
revoke all on function app_private.assistant_build_reservation_context(uuid,uuid,uuid) from public;

create or replace function public.assistant_submit_message(_conversation_id uuid,_message text,_human_available boolean default false,_idempotency_key text default null::text)
returns table(message_id uuid,automation_event_id uuid)
language plpgsql security definer set search_path to 'pg_catalog','public'
as $$
declare _c public.assistant_conversations%rowtype; _message_id uuid; _event_id uuid; _idem text; _person_id uuid; _trusted_context jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if _message is null or length(btrim(_message))<1 or length(_message)>2000 then raise exception 'invalid_message'; end if;
  select * into _c from public.assistant_conversations where id=_conversation_id;
  if _c.id is null then raise exception 'conversation_not_found'; end if;
  if _c.profile_id<>auth.uid() then raise exception 'assistant_access_denied'; end if;
  if _c.status<>'open' then raise exception 'conversation_closed'; end if;
  if not app_private.assistant_has_operation_access(_c.tenant_id,_c.operation_id,_c.profile_id) then raise exception 'operation_access_denied'; end if;
  select g.person_id into _person_id from public.participant_access_grants g
  where g.tenant_id=_c.tenant_id and g.operation_id=_c.operation_id and g.profile_id=_c.profile_id and g.status::text='active' and g.revoked_at is null
  order by g.activated_at desc nulls last,g.granted_at desc limit 1;
  _trusted_context:=app_private.assistant_localize_trusted_context(app_private.assistant_build_trusted_context(_c.tenant_id,_c.operation_id,_c.profile_id));
  _trusted_context:=jsonb_set(_trusted_context,'{reservation}',app_private.assistant_build_reservation_context(_c.tenant_id,_c.operation_id,_c.profile_id),true);
  insert into public.assistant_conversation_messages(conversation_id,tenant_id,role,content,status) values(_c.id,_c.tenant_id,'user',btrim(_message),'completed') returning id into _message_id;
  _idem:=coalesce(nullif(btrim(_idempotency_key),''),'assistant.request:'||_message_id::text);
  insert into public.automation_events(tenant_id,operation_id,actor_profile_id,event_type,source,idempotency_key,correlation_id,payload,dispatch_status)
  values(_c.tenant_id,_c.operation_id,_c.profile_id,'assistant.request','cobs_app',_idem,'assistant:'||_c.id::text||':'||_message_id::text,
    jsonb_build_object('message',btrim(_message),'channel',_c.channel,'locale',_c.locale,'human_available',coalesce(_human_available,false),'conversation_id',_c.id::text,'person_id',_person_id,'context',_trusted_context),'pending') returning id into _event_id;
  update public.assistant_conversation_messages set automation_event_id=_event_id,status='pending' where id=_message_id;
  update public.assistant_conversations set human_available=coalesce(_human_available,false),last_message_at=now(),updated_at=now() where id=_c.id;
  return query select _message_id,_event_id;
end;
$$;
