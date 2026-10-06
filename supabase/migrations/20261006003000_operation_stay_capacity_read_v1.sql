-- Authenticated manager read model for the active hospitality stay capacity.
-- Keeps the Team Seffrin approval UI aligned with the backend capacity gate.

create or replace function public.get_operation_stay_capacity(_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  _tenant_id uuid;
  _stay_id uuid;
  _capacity integer := 0;
  _active_guests integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select tenant_id into _tenant_id
  from public.operations
  where id = _operation_id;

  if _tenant_id is null then raise exception 'Operation not found'; end if;

  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = _tenant_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  ) then raise exception 'Manager access required'; end if;

  select s.id into _stay_id
  from public.hospitality_stays s
  where s.operation_id = _operation_id
    and s.tenant_id = _tenant_id
    and s.status <> 'cancelled'
  order by s.created_at
  limit 1;

  if _stay_id is null then
    return jsonb_build_object('found',false);
  end if;

  select coalesce(sum(r.capacity),0)::integer
    into _capacity
  from public.hospitality_rooms r
  where r.stay_id = _stay_id
    and r.tenant_id = _tenant_id
    and r.room_status <> 'blocked';

  select count(*)::integer
    into _active_guests
  from public.hospitality_stay_participations g
  where g.stay_id = _stay_id
    and g.tenant_id = _tenant_id
    and g.is_active is true;

  return jsonb_build_object(
    'found',true,
    'stay_id',_stay_id,
    'capacity',_capacity,
    'active_guests',_active_guests,
    'remaining_capacity',greatest(0,_capacity-_active_guests),
    'sold_out',(_capacity > 0 and _active_guests >= _capacity)
  );
end;
$$;

revoke all on function public.get_operation_stay_capacity(uuid) from public, anon, service_role;
grant execute on function public.get_operation_stay_capacity(uuid) to authenticated;
