create or replace function app_private.assistant_localize_time_fields(_obj jsonb, _timezone text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  _out jsonb := coalesce(_obj, '{}'::jsonb);
  _key text;
  _keys text[] := array['planned_start','planned_end','expected_start','expected_end','planned_departure','expected_departure','planned_arrival','expected_arrival','return_time','planned_check_in','expected_check_in','planned_check_out','expected_check_out'];
  _ts timestamptz;
begin
  foreach _key in array _keys loop
    if _out ? _key and nullif(_out->>_key,'') is not null then
      begin
        _ts := (_out->>_key)::timestamptz;
        _out := jsonb_set(_out, array[_key], to_jsonb(to_char(_ts at time zone _timezone,'YYYY-MM-DD HH24:MI:SS') || ' ' || _timezone), true);
      exception when others then
        null;
      end;
    end if;
  end loop;
  return _out;
end;
$$;

create or replace function app_private.assistant_localize_time_array(_items jsonb, _timezone text)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(app_private.assistant_localize_time_fields(x.value, _timezone)), '[]'::jsonb)
  from jsonb_array_elements(coalesce(_items,'[]'::jsonb)) x(value);
$$;

create or replace function app_private.assistant_localize_trusted_context(_ctx jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  _out jsonb := coalesce(_ctx,'{}'::jsonb);
  _timezone text := coalesce(nullif(_ctx#>>'{operation,timezone}',''),'UTC');
  _known jsonb := '[]'::jsonb;
  _fact jsonb;
begin
  _out := jsonb_set(_out,'{operation}',app_private.assistant_localize_time_fields(coalesce(_out->'operation','{}'::jsonb),_timezone),true);
  _out := jsonb_set(_out,'{schedule,journey}',app_private.assistant_localize_time_array(_out#>'{schedule,journey}',_timezone),true);
  _out := jsonb_set(_out,'{schedule,transport}',app_private.assistant_localize_time_array(_out#>'{schedule,transport}',_timezone),true);
  _out := jsonb_set(_out,'{schedule,events}',app_private.assistant_localize_time_array(_out#>'{schedule,events}',_timezone),true);
  _out := jsonb_set(_out,'{hospitality}',app_private.assistant_localize_time_array(_out->'hospitality',_timezone),true);

  for _fact in select value from jsonb_array_elements(coalesce(_out->'known_facts','[]'::jsonb)) loop
    if _fact->>'fact' in ('operation_planned_start','operation_planned_end','operation_expected_start','operation_expected_end') and nullif(_fact->>'value','') is not null then
      begin
        _fact := jsonb_set(_fact,'{value}',to_jsonb(to_char((_fact->>'value')::timestamptz at time zone _timezone,'YYYY-MM-DD HH24:MI:SS') || ' ' || _timezone),true);
      exception when others then null;
      end;
    end if;
    _known := _known || jsonb_build_array(_fact);
  end loop;
  _out := jsonb_set(_out,'{known_facts}',_known,true);
  _out := jsonb_set(_out,'{time_semantics}',jsonb_build_object('all_datetime_values','operation_local_time','timezone',_timezone,'instruction','Interpret all datetime values as local wall-clock time in the named operation timezone; do not reinterpret them as UTC.'),true);
  return _out;
end;
$$;

revoke all on function app_private.assistant_localize_time_fields(jsonb,text) from public;
revoke all on function app_private.assistant_localize_time_array(jsonb,text) from public;
revoke all on function app_private.assistant_localize_trusted_context(jsonb) from public;

create or replace function public.assistant_submit_message(_conversation_id uuid, _message text, _human_available boolean default false, _idempotency_key text default null)
returns table(message_id uuid, automation_event_id uuid)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  _c public.assistant_conversations%rowtype; _message_id uuid; _event_id uuid; _idem text; _person_id uuid; _trusted_context jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if _message is null or length(btrim(_message)) < 1 or length(_message) > 2000 then raise exception 'invalid_message'; end if;
  select * into _c from public.assistant_conversations where id=_conversation_id;
  if _c.id is null then raise exception 'conversation_not_found'; end if;
  if _c.profile_id <> auth.uid() then raise exception 'assistant_access_denied'; end if;
  if _c.status <> 'open' then raise exception 'conversation_closed'; end if;
  if not app_private.assistant_has_operation_access(_c.tenant_id,_c.operation_id,_c.profile_id) then raise exception 'operation_access_denied'; end if;

  select g.person_id into _person_id from public.participant_access_grants g
  where g.tenant_id=_c.tenant_id and g.operation_id=_c.operation_id and g.profile_id=_c.profile_id and g.status::text='active' and g.revoked_at is null
  order by g.activated_at desc nulls last, g.granted_at desc limit 1;
  _trusted_context := app_private.assistant_localize_trusted_context(app_private.assistant_build_trusted_context(_c.tenant_id,_c.operation_id,_c.profile_id));

  insert into public.assistant_conversation_messages(conversation_id,tenant_id,role,content,status)
  values (_c.id,_c.tenant_id,'user',btrim(_message),'completed') returning id into _message_id;
  _idem := coalesce(nullif(btrim(_idempotency_key),''),'assistant.request:'||_message_id::text);
  insert into public.automation_events(tenant_id,operation_id,actor_profile_id,event_type,source,idempotency_key,correlation_id,payload,dispatch_status)
  values (_c.tenant_id,_c.operation_id,_c.profile_id,'assistant.request','cobs_app',_idem,'assistant:'||_c.id::text||':'||_message_id::text,
    jsonb_build_object('message',btrim(_message),'channel',_c.channel,'locale',_c.locale,'human_available',coalesce(_human_available,false),'conversation_id',_c.id::text,'person_id',_person_id,'context',_trusted_context),'pending')
  returning id into _event_id;
  update public.assistant_conversation_messages set automation_event_id=_event_id,status='pending' where id=_message_id;
  update public.assistant_conversations set human_available=coalesce(_human_available,false),last_message_at=now(),updated_at=now() where id=_c.id;
  return query select _message_id,_event_id;
end;
$$;
revoke all on function public.assistant_submit_message(uuid,text,boolean,text) from public;
grant execute on function public.assistant_submit_message(uuid,text,boolean,text) to authenticated;