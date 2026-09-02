create unique index if not exists journey_steps_id_operation_tenant_key
  on public.journey_steps (id, operation_id, tenant_id);

create table public.journey_visit_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  journey_step_id uuid not null,
  sequence integer not null check (sequence > 0),
  title text not null check (btrim(title) <> ''),
  interpretation text,
  guide_tip text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_visit_points_step_operation_tenant_fk
    foreign key (journey_step_id, operation_id, tenant_id)
    references public.journey_steps(id, operation_id, tenant_id)
    on delete cascade,
  constraint journey_visit_points_operation_tenant_fk
    foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id)
    on delete cascade,
  constraint journey_visit_points_step_sequence_key unique (journey_step_id, sequence)
);

create unique index journey_visit_points_id_operation_tenant_key
  on public.journey_visit_points (id, operation_id, tenant_id);
create index journey_visit_points_step_sequence_idx
  on public.journey_visit_points (journey_step_id, sequence);

create table public.journey_visit_point_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  journey_step_id uuid not null,
  visit_point_id uuid not null,
  event_type text not null check (event_type in ('VISITED','UNAVAILABLE','IGNORED','RESTORED')),
  note text,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null default now(),
  constraint journey_visit_point_events_point_operation_tenant_fk
    foreign key (visit_point_id, operation_id, tenant_id)
    references public.journey_visit_points(id, operation_id, tenant_id)
    on delete cascade,
  constraint journey_visit_point_events_step_operation_tenant_fk
    foreign key (journey_step_id, operation_id, tenant_id)
    references public.journey_steps(id, operation_id, tenant_id)
    on delete cascade
);

create index journey_visit_point_events_point_time_idx
  on public.journey_visit_point_events (visit_point_id, occurred_at desc);
create index journey_visit_point_events_operation_time_idx
  on public.journey_visit_point_events (operation_id, occurred_at desc);

alter table public.journey_visit_points enable row level security;
alter table public.journey_visit_point_events enable row level security;

revoke all on public.journey_visit_points from public, anon, authenticated;
revoke all on public.journey_visit_point_events from public, anon, authenticated;
grant select on public.journey_visit_points to authenticated;
grant select on public.journey_visit_point_events to authenticated;
grant all on public.journey_visit_points to service_role;
grant all on public.journey_visit_point_events to service_role;

create policy "Elevated roles read journey visit points"
  on public.journey_visit_points
  for select
  to authenticated
  using (
    app_private.has_tenant_role(
      tenant_id,
      array['owner'::public.app_role, 'admin'::public.app_role, 'operations_agent'::public.app_role]
    )
  );

create policy "Elevated roles read journey visit point events"
  on public.journey_visit_point_events
  for select
  to authenticated
  using (
    app_private.has_tenant_role(
      tenant_id,
      array['owner'::public.app_role, 'admin'::public.app_role, 'operations_agent'::public.app_role]
    )
  );

create or replace function public.create_journey_visit_point(
  _journey_step_id uuid,
  _title text,
  _interpretation text default null,
  _guide_tip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _step public.journey_steps;
  _op public.operations;
  _row public.journey_visit_points;
  _seq integer;
  _title_clean text := nullif(btrim(coalesce(_title, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _title_clean is null then
    raise exception 'Visit point title is required';
  end if;

  _step := app_private.w04_step(
    _journey_step_id,
    array['owner','admin','operations_agent']
  );

  select * into _op from public.operations where id = _step.operation_id;
  if _op.status not in ('draft','planning') then
    raise exception 'Visit points can only be created while the operation is in draft or planning';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_interpretation, '')), ''));
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_guide_tip, '')), ''));

  select coalesce(max(v.sequence), 0) + 10
    into _seq
    from public.journey_visit_points v
    where v.journey_step_id = _step.id;

  insert into public.journey_visit_points (
    tenant_id,
    operation_id,
    journey_step_id,
    sequence,
    title,
    interpretation,
    guide_tip,
    created_by
  ) values (
    _step.tenant_id,
    _step.operation_id,
    _step.id,
    _seq,
    _title_clean,
    nullif(btrim(coalesce(_interpretation, '')), ''),
    nullif(btrim(coalesce(_guide_tip, '')), ''),
    auth.uid()
  ) returning * into _row;

  perform app_private.record_audit_event(
    _step.tenant_id,
    auth.uid(),
    'journey.visit_point_created',
    'journey_visit_point',
    _row.id,
    null,
    jsonb_build_object(
      'operation_id', _step.operation_id,
      'journey_step_id', _step.id,
      'sequence', _row.sequence,
      'title', _row.title
    )
  );

  return jsonb_build_object(
    'visit_point_id', _row.id,
    'journey_step_id', _row.journey_step_id,
    'sequence', _row.sequence
  );
end;
$$;

create or replace function public.set_journey_visit_point_status(
  _visit_point_id uuid,
  _status text,
  _note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _point public.journey_visit_points;
  _step public.journey_steps;
  _op public.operations;
  _event_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into _point
    from public.journey_visit_points
    where id = _visit_point_id;

  if _point.id is null then
    raise exception 'Visit point not found';
  end if;

  _step := app_private.w04_step(
    _point.journey_step_id,
    array['owner','admin','operations_agent']
  );

  select * into _op from public.operations where id = _step.operation_id;
  if _op.status <> 'active' then
    raise exception 'Visit point status can only change while the operation is active';
  end if;

  _event_type := case lower(btrim(coalesce(_status, '')))
    when 'visited' then 'VISITED'
    when 'unavailable' then 'UNAVAILABLE'
    when 'ignored' then 'IGNORED'
    when 'available' then 'RESTORED'
    else null
  end;

  if _event_type is null then
    raise exception 'Invalid visit point status';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note, '')), ''));

  insert into public.journey_visit_point_events (
    tenant_id,
    operation_id,
    journey_step_id,
    visit_point_id,
    event_type,
    note,
    actor_profile_id
  ) values (
    _point.tenant_id,
    _point.operation_id,
    _point.journey_step_id,
    _point.id,
    _event_type,
    nullif(btrim(coalesce(_note, '')), ''),
    auth.uid()
  );

  perform app_private.record_audit_event(
    _point.tenant_id,
    auth.uid(),
    'journey.visit_point_status_changed',
    'journey_visit_point',
    _point.id,
    null,
    jsonb_build_object(
      'operation_id', _point.operation_id,
      'journey_step_id', _point.journey_step_id,
      'status', lower(btrim(_status))
    )
  );

  return jsonb_build_object(
    'visit_point_id', _point.id,
    'status', lower(btrim(_status))
  );
end;
$$;

revoke all on function public.create_journey_visit_point(uuid, text, text, text) from public, anon;
revoke all on function public.set_journey_visit_point_status(uuid, text, text) from public, anon;
grant execute on function public.create_journey_visit_point(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.set_journey_visit_point_status(uuid, text, text) to authenticated, service_role;