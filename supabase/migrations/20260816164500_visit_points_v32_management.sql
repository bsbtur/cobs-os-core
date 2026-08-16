create or replace function public.update_journey_visit_point(
  _visit_point_id uuid,
  _title text,
  _interpretation text default null,
  _guide_tip text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _point public.journey_visit_points;
  _step public.journey_steps;
  _op public.operations;
  _title_clean text := nullif(btrim(coalesce(_title, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _title_clean is null then raise exception 'Visit point title is required'; end if;

  select * into _point from public.journey_visit_points where id = _visit_point_id;
  if _point.id is null then raise exception 'Visit point not found'; end if;
  if coalesce((_point.metadata ->> 'archived')::boolean, false) then
    raise exception 'Archived visit points cannot be edited';
  end if;

  _step := app_private.w04_step(_point.journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations where id = _step.operation_id;
  if _op.status not in ('draft','planning') then
    raise exception 'Visit points can only be edited while the operation is in draft or planning';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_interpretation, '')), ''));
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_guide_tip, '')), ''));

  update public.journey_visit_points
  set title = _title_clean,
      interpretation = nullif(btrim(coalesce(_interpretation, '')), ''),
      guide_tip = nullif(btrim(coalesce(_guide_tip, '')), ''),
      updated_at = now()
  where id = _point.id
  returning * into _point;

  perform app_private.record_audit_event(
    _point.tenant_id, auth.uid(), 'journey.visit_point_updated', 'journey_visit_point', _point.id, null,
    jsonb_build_object('operation_id', _point.operation_id, 'journey_step_id', _point.journey_step_id, 'title', _point.title)
  );

  return jsonb_build_object('visit_point_id', _point.id);
end;
$function$;

create or replace function public.archive_journey_visit_point(
  _visit_point_id uuid,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _point public.journey_visit_points;
  _step public.journey_steps;
  _op public.operations;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _point from public.journey_visit_points where id = _visit_point_id;
  if _point.id is null then raise exception 'Visit point not found'; end if;
  if coalesce((_point.metadata ->> 'archived')::boolean, false) then
    return jsonb_build_object('visit_point_id', _point.id, 'archived', true);
  end if;

  _step := app_private.w04_step(_point.journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations where id = _step.operation_id;
  if _op.status not in ('draft','planning') then
    raise exception 'Visit points can only be archived while the operation is in draft or planning';
  end if;
  perform app_private.assert_generic_note(_reason_clean);

  update public.journey_visit_points
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'archived', true,
        'archived_at', now(),
        'archived_by', auth.uid(),
        'archive_reason', _reason_clean
      )),
      updated_at = now()
  where id = _point.id
  returning * into _point;

  perform app_private.record_audit_event(
    _point.tenant_id, auth.uid(), 'journey.visit_point_archived', 'journey_visit_point', _point.id, null,
    jsonb_build_object('operation_id', _point.operation_id, 'journey_step_id', _point.journey_step_id, 'reason', _reason_clean)
  );

  return jsonb_build_object('visit_point_id', _point.id, 'archived', true);
end;
$function$;

create or replace function public.reorder_journey_visit_points(
  _journey_step_id uuid,
  _visit_point_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
  _op public.operations;
  _active_count integer;
  _distinct_count integer;
  _matched_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations where id = _step.operation_id;
  if _op.status not in ('draft','planning') then
    raise exception 'Visit points can only be reordered while the operation is in draft or planning';
  end if;

  select count(*) into _active_count
  from public.journey_visit_points
  where journey_step_id = _step.id
    and not coalesce((metadata ->> 'archived')::boolean, false);

  select count(distinct x) into _distinct_count
  from unnest(coalesce(_visit_point_ids, array[]::uuid[])) x;

  select count(*) into _matched_count
  from public.journey_visit_points p
  where p.journey_step_id = _step.id
    and not coalesce((p.metadata ->> 'archived')::boolean, false)
    and p.id = any(coalesce(_visit_point_ids, array[]::uuid[]));

  if cardinality(coalesce(_visit_point_ids, array[]::uuid[])) <> _active_count
     or _distinct_count <> _active_count
     or _matched_count <> _active_count then
    raise exception 'Visit point reorder payload must contain every active point exactly once';
  end if;

  update public.journey_visit_points p
  set sequence = ordered.ordinality::integer * 10,
      updated_at = now()
  from unnest(_visit_point_ids) with ordinality as ordered(id, ordinality)
  where p.id = ordered.id
    and p.journey_step_id = _step.id;

  perform app_private.record_audit_event(
    _step.tenant_id, auth.uid(), 'journey.visit_points_reordered', 'journey_step', _step.id, null,
    jsonb_build_object('operation_id', _step.operation_id, 'visit_point_ids', _visit_point_ids)
  );

  return jsonb_build_object('journey_step_id', _step.id, 'count', _active_count);
end;
$function$;

revoke all on function public.update_journey_visit_point(uuid,text,text,text) from public;
revoke all on function public.archive_journey_visit_point(uuid,text) from public;
revoke all on function public.reorder_journey_visit_points(uuid,uuid[]) from public;
grant execute on function public.update_journey_visit_point(uuid,text,text,text) to authenticated;
grant execute on function public.archive_journey_visit_point(uuid,text) to authenticated;
grant execute on function public.reorder_journey_visit_points(uuid,uuid[]) to authenticated;
