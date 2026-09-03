create or replace function app_private.w07b_enqueue_test_delivery(_message_id uuid, _person_id uuid, _destination text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare _m public.messages; _r public.message_recipients; _o public.communication_outbox;
begin
  select * into _m from public.messages where id=_message_id;
  if _m.id is null then raise exception 'Message not found'; end if;
  if _m.status <> 'published' then raise exception 'Only a published message can enter an external outbox'; end if;
  select * into _r from public.message_recipients where message_id=_message_id and person_id=_person_id;
  if _r.id is null then raise exception 'Person is not a materialized recipient of this message'; end if;
  if nullif(btrim(coalesce(_destination,'')),'') is null then raise exception 'Destination is required'; end if;
  insert into public.communication_outbox(tenant_id,message_id,recipient_id,person_id,channel,destination_snapshot,next_attempt_at)
  values(_m.tenant_id,_m.id,_r.id,_person_id,'test',btrim(_destination),now())
  on conflict do nothing
  returning * into _o;
  if _o.id is null then
    select * into _o from public.communication_outbox where message_id=_message_id and person_id=_person_id and channel='test';
  end if;
  return jsonb_build_object('outbox_id',_o.id,'status',_o.status,'unchanged',_o.created_at < now());
end $function$;