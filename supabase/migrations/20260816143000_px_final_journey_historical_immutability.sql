-- PX FINAL — close the last historical mutation surface for Journey.
-- Closed operations are evidence: journey definition and journey facts are read-only.

create or replace function public.update_journey_step(
  _journey_step_id uuid,
  _title text default null,
  _description text default null,
  _location_label text default null,
  _traveler_label text default null,
  _traveler_facing boolean default null,
  _planned_start timestamptz default null,
  _planned_end timestamptz default null,
  _presence_requirement public.step_presence_requirement default null,
  _presence_population public.step_presence_population default null,
  _apply_planned boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _step public.journey_steps;
  _op public.operations;
  _req public.step_presence_requirement;
  _pop public.step_presence_population;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  perform app_private.assert_operation_not_closed(_step.operation_id);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  _req := coalesce(_presence_requirement, _step.presence_requirement);
  _pop := coalesce(_presence_population, _step.presence_population);
  if _presence_requirement is not null or _presence_population is not null then
    perform app_private.w04_assert_presence_contract(_step.step_kind, _req, _pop);
  end if;

  perform set_config('app.w04_control','on', true);
  update public.journey_steps set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), title),
    description = case when _description is null then description else nullif(btrim(_description),'') end,
    location_label = case when _location_label is null then location_label else nullif(btrim(_location_label),'') end,
    traveler_label = case when _traveler_label is null then traveler_label else nullif(btrim(_traveler_label),'') end,
    traveler_facing = coalesce(_traveler_facing, traveler_facing),
    presence_requirement = _req,
    presence_population = _pop,
    planned_start = case when _apply_planned and plan_origin = 'planned' then _planned_start else planned_start end,
    planned_end = case when _apply_planned and plan_origin = 'planned' then _planned_end else planned_end end
  where id = _step.id;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(
    _step.tenant_id,
    auth.uid(),
    'journey.step_updated',
    'journey_step',
    _step.id,
    null,
    jsonb_build_object(
      'operation_id', _step.operation_id,
      'operation_status', _op.status,
      'planned_changed', coalesce(_apply_planned,false)
    )
  );
  return jsonb_build_object('journey_step_id', _step.id);
end;
$$;

drop trigger if exists trg_closed_op_journey_steps on public.journey_steps;
create trigger trg_closed_op_journey_steps
before insert or update or delete on public.journey_steps
for each row execute function app_private.guard_closed_operation_child();

drop trigger if exists trg_closed_op_journey_events on public.journey_events;
create trigger trg_closed_op_journey_events
before insert or update or delete on public.journey_events
for each row execute function app_private.guard_closed_operation_child();
