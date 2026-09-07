-- COBS OS · CIOSP 2027 official Journey v1
-- Source of truth: official CIOSP/APCD public schedule, verified 2026-09-07.
-- Scope deliberately excludes BSBTUR flight, hotel, private transfers, meals and individual courses.
-- Official scientific programme: 27-30 Jan 2027, 10:00-18:00 America/Sao_Paulo.
-- Venue: Expo Center Norte, São Paulo/SP.

DO $$
DECLARE
  v_operation_id uuid := '8c84e916-d24b-4341-a711-a75d62a7b468';
  v_owner uuid;
  v_day date;
  v_sequence integer;
BEGIN
  select profile_id into v_owner
  from public.memberships
  where tenant_id='bb25410b-4c7a-4d4c-965c-ee43d7084068'
    and role='owner' and status='active'
  order by created_at
  limit 1;
  if v_owner is null then raise exception 'ciosp_owner_profile_required'; end if;

  perform set_config('app.w04_control','on',true);
  for v_day,v_sequence in
    select * from (values
      ('2027-01-27'::date,20),('2027-01-28'::date,30),
      ('2027-01-29'::date,40),('2027-01-30'::date,50)
    ) d(day_value,sequence_value)
  loop
    if not exists (
      select 1 from public.journey_steps js
      where js.operation_id=v_operation_id
        and js.archived_at is null
        and js.metadata->>'source_key'='ciosp-2027-official-scientific-programme'
        and (js.metadata->>'official_date')::date=v_day
    ) then
      insert into public.journey_steps(
        tenant_id,operation_id,sequence,title,description,step_kind,plan_origin,
        planned_start,planned_end,location_label,traveler_label,traveler_facing,
        presence_requirement,presence_population,metadata,created_by
      ) values(
        'bb25410b-4c7a-4d4c-965c-ee43d7084068',v_operation_id,v_sequence,
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
