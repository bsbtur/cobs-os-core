create or replace function app_private.assistant_destination_direct_answer(_ctx jsonb, _message text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog','public'
as $function$
declare
  _msg text := btrim(coalesce(_message,''));
  _target text;
  _target_lc text;
  _leg jsonb;
  _journey jsonb;
  _origin text;
  _destination text;
  _date_text text;
  _date_label text;
  _departure text;
begin
  _target := substring(_msg from '(?i)como[[:space:]]+(?:eu[[:space:]]+)?(?:volto|vou|retorno)[[:space:]]+para[[:space:]]+(.+)$');
  if _target is null then return null; end if;

  _target := btrim(_target, ' "' || chr(39) || '?.!');
  if _target = '' then return null; end if;
  _target_lc := lower(_target);

  select value into _leg
  from jsonb_array_elements(coalesce(_ctx#>'{schedule,transport}','[]'::jsonb))
  where lower(coalesce(value->>'destination','')) = _target_lc
     or lower(coalesce(value->>'destination','')) like _target_lc || ' ·%'
     or lower(coalesce(value->>'destination','')) like _target_lc || ' -%'
  order by coalesce((value->>'sequence')::int,2147483647)
  limit 1;

  if _leg is null then return null; end if;

  _origin := nullif(_leg->>'origin','');
  _destination := nullif(_leg->>'destination','');
  _departure := coalesce(nullif(_leg->>'expected_departure',''),nullif(_leg->>'planned_departure',''));

  select value into _journey
  from jsonb_array_elements(coalesce(_ctx#>'{schedule,journey}','[]'::jsonb))
  where lower(coalesce(value->>'location','')) like '%→ ' || _target_lc
     or lower(coalesce(value->>'location','')) like '%→ ' || _target_lc || ' ·%'
  order by coalesce((value->>'sequence')::int,2147483647)
  limit 1;

  if _journey is not null then
    _date_text := left(coalesce(_journey->>'expected_start',_journey->>'planned_start',''),10);
    if _date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      _date_label := to_char(_date_text::date,'DD/MM/YYYY');
    end if;
  end if;

  if _date_label is not null and _origin is not null then
    if _departure is null then
      return format('Você volta para %s no dia %s, saindo de %s. O horário desse traslado ainda está a confirmar.',_target,_date_label,_origin);
    end if;
    return format('Você volta para %s no dia %s, saindo de %s.',_target,_date_label,_origin);
  end if;

  if _origin is not null then
    if _departure is null then
      return format('O roteiro prevê um traslado de %s para %s. O horário ainda está a confirmar.',_origin,coalesce(_destination,_target));
    end if;
    return format('O roteiro prevê um traslado de %s para %s.',_origin,coalesce(_destination,_target));
  end if;

  return null;
end;
$function$;

create or replace function app_private.assistant_capture_automation_result()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _event public.automation_events%rowtype;
  _conversation_id uuid;
  _reply text;
  _direct_reply text;
begin
  select * into _event from public.automation_events where id=new.automation_event_id;
  if _event.id is null or _event.event_type<>'assistant.request' then return new; end if;

  begin
    _conversation_id:=nullif(_event.payload->>'conversation_id','')::uuid;
  exception when others then
    _conversation_id:=null;
  end;
  if _conversation_id is null then return new; end if;

  update public.assistant_conversation_messages
  set status=case when new.outcome='completed' then 'completed' else 'failed' end,
      metadata=metadata || jsonb_build_object('automation_result_id',new.id)
  where automation_event_id=new.automation_event_id and role='user';

  if new.outcome='completed' and coalesce(btrim(new.suggested_reply),'')<>'' then
    _direct_reply:=app_private.assistant_destination_direct_answer(
      _event.payload->'context',
      _event.payload->>'message'
    );
    _reply:=coalesce(nullif(btrim(_direct_reply),''),btrim(new.suggested_reply));

    insert into public.assistant_conversation_messages(
      conversation_id,tenant_id,role,content,automation_event_id,automation_result_id,status,metadata
    ) values (
      _conversation_id,new.tenant_id,'assistant',_reply,new.automation_event_id,new.id,'completed',
      jsonb_build_object(
        'intent',new.intent,
        'urgency',new.urgency,
        'summary',new.summary,
        'provider_metadata',new.provider_metadata,
        'deterministic_destination_answer',(_direct_reply is not null)
      )
    ) on conflict do nothing;
  elsif new.outcome='failed' then
    insert into public.assistant_conversation_messages(
      conversation_id,tenant_id,role,content,automation_event_id,automation_result_id,status,metadata
    ) values (
      _conversation_id,new.tenant_id,'system',
      'Não foi possível concluir esta resposta automaticamente.',
      new.automation_event_id,new.id,'failed',
      jsonb_build_object('error_code',new.error_code,'error_message',new.error_message)
    ) on conflict do nothing;
  end if;

  update public.assistant_conversations
  set last_message_at=now(),updated_at=now()
  where id=_conversation_id and tenant_id=new.tenant_id;

  return new;
end;
$function$;