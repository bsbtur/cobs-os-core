-- Team Seffrin portal canonical truth repair.
-- 1) Neutralize unconfirmed Florianópolis return origin.
-- 2) Cancel the duplicate airport shuttle while preserving the canonical return leg.
-- 3) Create a date-only external Maratona Brasília 2027 event linked to the journey,
--    keeping time, venue and producer explicitly unconfirmed.

do $$
declare
  _tenant uuid := 'bb25410b-4c7a-4d4c-965c-ee43d7084068';
  _operation uuid := 'b207edae-7293-4d57-b994-5a442a1fad89';
  _return_step uuid := 'da73dacb-d895-45fb-8aa3-9df9f4dbb615';
  _marathon_step uuid := '9c4a2f0c-948e-4572-9af0-12b25a3e991e';
  _duplicate_leg uuid := '6c68f001-b6a6-4fb2-90c4-cba9a987e954';
  _canonical_return_leg uuid := '27a452d2-8399-4d1a-871a-1f4265d31da5';
  _leg public.transport_legs;
  _event_id uuid;
  _step public.journey_steps;
begin
  select * into _step
  from public.journey_steps
  where id=_return_step and operation_id=_operation and tenant_id=_tenant
  for update;

  if _step.id is null then
    raise exception 'Team Seffrin return journey step not found';
  end if;

  if _step.location_label = 'Brasília → Aeroporto BSB → Florianópolis' then
    perform set_config('app.w04_control','on',true);
    update public.journey_steps
       set location_label='Brasília → Aeroporto BSB → Origem do grupo',
           updated_at=now()
     where id=_return_step;
    perform set_config('app.w04_control','off',true);

    perform app_private.record_audit_event(
      _tenant,null,'journey.step_updated','journey_step',_return_step,
      'team-seffrin-home-truth-20261006',
      jsonb_build_object(
        'operation_id',_operation,
        'field','location_label',
        'before','Brasília → Aeroporto BSB → Florianópolis',
        'after','Brasília → Aeroporto BSB → Origem do grupo',
        'reason','Unconfirmed origin neutralized'
      )
    );
  elsif _step.location_label <> 'Brasília → Aeroporto BSB → Origem do grupo' then
    raise exception 'Unexpected return journey location: %', _step.location_label;
  end if;

  select * into _leg
  from public.transport_legs
  where id=_duplicate_leg and operation_id=_operation and tenant_id=_tenant
  for update;

  if _leg.id is null or _leg.sequence <> 90 or _leg.leg_kind::text <> 'shuttle' then
    raise exception 'Duplicate return shuttle is not in expected state';
  end if;

  perform 1
  from public.transport_legs
  where id=_canonical_return_leg
    and operation_id=_operation
    and tenant_id=_tenant
    and sequence=100
    and leg_kind::text='return'
    and journey_step_id=_return_step;
  if not found then
    raise exception 'Canonical return leg is not in expected state';
  end if;

  if not app_private.w05_has_event(_duplicate_leg,'LEG_CANCELLED') then
    perform app_private.record_transport_event(
      _leg,
      'LEG_CANCELLED',
      null,
      'Trecho duplicado do retorno canônico. Mantido o trecho Retorno para o Aeroporto BSB.'
    );

    perform app_private.record_audit_event(
      _tenant,null,'transport.leg_cancelled','transport_leg',_duplicate_leg,
      'team-seffrin-home-truth-20261006',
      jsonb_build_object(
        'operation_id',_operation,
        'reason','Duplicate of canonical return leg',
        'canonical_return_leg_id',_canonical_return_leg
      )
    );
  end if;

  select id into _event_id
  from public.events
  where operation_id=_operation
    and tenant_id=_tenant
    and journey_step_id=_marathon_step
    and name='Maratona Brasília 2027'
  order by created_at
  limit 1;

  if _event_id is null then
    perform set_config('app.w07_control','on',true);

    insert into public.events (
      tenant_id,operation_id,journey_step_id,name,source_kind,
      external_producer_name,status,timezone,
      planned_start,planned_end,notes,schedule_precision,created_by
    )
    select
      _tenant,_operation,_marathon_step,'Maratona Brasília 2027','external',
      'A confirmar','draft','America/Sao_Paulo',
      j.planned_start,j.planned_end,
      'Data prevista na jornada. Horário, local da prova e organização ainda a confirmar.',
      'date_only',null
    from public.journey_steps j
    where j.id=_marathon_step
      and j.operation_id=_operation
      and j.tenant_id=_tenant
    returning id into _event_id;

    perform set_config('app.w07_control','off',true);

    if _event_id is null then
      raise exception 'Failed to create Maratona Brasília 2027 event';
    end if;

    perform app_private.record_audit_event(
      _tenant,null,'event.created','event',_event_id,
      'team-seffrin-home-truth-20261006',
      jsonb_build_object(
        'operation_id',_operation,
        'source_kind','external',
        'schedule_precision','date_only',
        'journey_step_id',_marathon_step,
        'known_unknowns',jsonb_build_array('time','venue','producer')
      )
    );
  end if;
end
$$;
