-- COBS OS · CIOSP 2027 official Journey v1
-- Source of truth: official CIOSP/APCD public schedule, verified 2026-09-07.
-- Scope deliberately excludes BSBTUR flight, hotel, private transfers, meals and individual courses.
-- Official scientific programme: 27-30 Jan 2027, 10:00-18:00 America/Sao_Paulo.
-- Venue: Expo Center Norte, São Paulo/SP.
--
-- This migration intentionally resolves the target by the canonical operation code.
-- Environment-specific tenant/operation UUIDs must never be embedded in repository migrations.

DO $$
DECLARE
  v_operation public.operations;
  v_owner uuid;
  v_day date;
  v_sequence integer;
BEGIN
  select o.* into v_operation
  from public.operations o
  where o.code = 'CIOSP-SP-2027'
    and o.archived_at is null;

  if v_operation.id is null then
    raise exception 'ciosp_operation_required';
  end if;

  if (select count(*) from public.operations o where o.code = 'CIOSP-SP-2027' and o.archived_at is null) <> 1 then
    raise exception 'ciosp_operation_ambiguous';
  end if;

  select m.profile_id into v_owner
  from public.memberships m
  where m.tenant_id = v_operation.tenant_id
    and m.role = 'owner'
    and m.status = 'active'
  order by m.created_at
  limit 1;

  if v_owner is null then
    raise exception 'ciosp_owner_profile_required';
  end if;

  perform set_config('app.w04_control','on',true);

  for v_day in
    select day_value
    from (values
      ('2027-01-27'::date),
      ('2027-01-28'::date),
      ('2027-01-29'::date),
      ('2027-01-30'::date)
    ) d(day_value)
    order by day_value
  loop
    if not exists (
      select 1 from public.journey_steps js
      where js.operation_id = v_operation.id
        and js.archived_at is null
        and js.metadata->>'source_key' = 'ciosp-2027-official-scientific-programme'
        and js.metadata->>'official_date' = v_day::text
    ) then
      select coalesce(max(js.sequence), 0) + 10 into v_sequence
      from public.journey_steps js
      where js.operation_id = v_operation.id
        and js.archived_at is null;

      insert into public.journey_steps(
        tenant_id,operation_id,sequence,title,description,step_kind,plan_origin,
        planned_start,planned_end,location_label,traveler_label,traveler_facing,
        presence_requirement,presence_population,metadata,created_by
      ) values(
        v_operation.tenant_id,v_operation.id,v_sequence,
        '44º CIOSP — '||to_char(v_day,'DD/MM/YYYY'),
        'Programação Científica Oficial do 44º CIOSP. A programação detalhada de cursos e atividades será publicada pela organização do evento.',
        'activity','planned',
        (v_day::text||' 10:00:00-03')::timestamptz,
        (v_day::text||' 18:00:00-03')::timestamptz,
        'Expo Center Norte — São Paulo/SP',
        'Programação Científica Oficial · 10h às 18h',true,
        'none','participants',
        jsonb_build_object(
          'source_key','ciosp-2027-official-scientific-programme',
          'source_kind','external_official',
          'source_organization','APCD / CIOSP',
          'source_url','https://www.ciosp.com.br/duvidas-frequentes',
          'verified_at','2026-09-07',
          'schedule_precision','official_window',
          'official_date',v_day::text,
          'detail_status','awaiting_official_detailed_programme'
        ),v_owner
      );
    end if;
  end loop;

  perform set_config('app.w04_control','off',true);
END $$;
