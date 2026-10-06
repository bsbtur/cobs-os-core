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