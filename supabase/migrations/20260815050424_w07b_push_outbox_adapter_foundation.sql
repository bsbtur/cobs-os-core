alter type public.external_channel add value if not exists 'push';

alter table public.communication_outbox add column device_id uuid;
alter table public.communication_outbox add constraint communication_outbox_device_fk foreign key (device_id) references public.communication_devices(id) on delete set null;
alter table public.communication_outbox drop constraint communication_outbox_unique;
create unique index communication_outbox_unique_non_device on public.communication_outbox(message_id,person_id,channel) where device_id is null;
create unique index communication_outbox_unique_device on public.communication_outbox(message_id,device_id,channel) where device_id is not null;
create index communication_outbox_device_idx on public.communication_outbox(device_id,created_at);

create or replace function app_private.w07b_enqueue_push_for_message(_message_id uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _m public.messages; _count int:=0; _row record;
begin
  select * into _m from public.messages where id=_message_id;
  if _m.id is null then raise exception 'Message not found'; end if;
  if _m.status <> 'published' then raise exception 'Only a published message can enter push outbox'; end if;
  for _row in
    select r.id recipient_id,r.person_id,d.id device_id,d.installation_id
    from public.message_recipients r
    join public.communication_devices d on d.tenant_id=r.tenant_id and d.person_id=r.person_id
    where r.message_id=_message_id and d.enabled and d.revoked_at is null
    order by r.created_at,r.id,d.created_at,d.id
  loop
    insert into public.communication_outbox(tenant_id,message_id,recipient_id,person_id,channel,device_id,destination_snapshot,next_attempt_at)
    values(_m.tenant_id,_m.id,_row.recipient_id,_row.person_id,'push',_row.device_id,_row.installation_id,now())
    on conflict do nothing;
    if found then _count:=_count+1; end if;
  end loop;
  return jsonb_build_object('message_id',_message_id,'queued',_count,'channel','push');
end $$;

create or replace function app_private.w07b_push_destination(_outbox_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare _o public.communication_outbox; _d public.communication_devices;
begin
  select * into _o from public.communication_outbox where id=_outbox_id and channel='push';
  if _o.id is null then raise exception 'Push outbox item not found'; end if;
  select * into _d from public.communication_devices where id=_o.device_id and tenant_id=_o.tenant_id;
  if _d.id is null or not _d.enabled or _d.revoked_at is not null then raise exception 'Push device is no longer active'; end if;
  return jsonb_build_object('device_id',_d.id,'provider',_d.push_provider,'platform',_d.platform,'installation_id',_d.installation_id,'push_token',_d.push_token,'locale',_d.locale);
end $$;

revoke all on function app_private.w07b_enqueue_push_for_message(uuid) from public,anon,authenticated;
revoke all on function app_private.w07b_push_destination(uuid) from public,anon,authenticated;