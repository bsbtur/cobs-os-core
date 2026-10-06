-- Team Seffrin mobility truth completion.
-- Adds the two missing return shuttles for the Chapada day trips.
-- Times remain intentionally unconfirmed.

do $$
declare
  _tenant uuid := 'bb25410b-4c7a-4d4c-965c-ee43d7084068';
  _operation uuid := 'b207edae-7293-4d57-b994-5a442a1fad89';
  _parque_step uuid := 'a8829e1d-8893-45dd-a42f-d3c5c90c9c5e';
  _morada_step uuid := '92d48550-8cc0-40c7-8bb4-3863356960ed';
  _id uuid;
begin
  if not exists (
    select 1 from public.transport_legs
    where operation_id=_operation
      and tenant_id=_tenant
      and journey_step_id=_parque_step
      and origin_label='São Jorge / Parque Nacional da Chapada dos Veadeiros'
      and destination_label='Alto Paraíso de Goiás · GO'
  ) then
    perform set_config('app.w05_control','on',true);
    insert into public.transport_legs (
      tenant_id,operation_id,journey_step_id,sequence,title,leg_kind,
      plan_origin,origin_label,destination_label,
      planned_departure,planned_arrival,notes,created_by
    ) values (
      _tenant,_operation,_parque_step,25,
      'São Jorge / Parque Nacional → Alto Paraíso',
      'shuttle','planned',
      'São Jorge / Parque Nacional da Chapada dos Veadeiros',
      'Alto Paraíso de Goiás · GO',
      null,null,
      'Retorno do passeio. Horário a confirmar.',
      null
    )
    returning id into _id;
    perform set_config('app.w05_control','off',true);

    perform app_private.record_audit_event(
      _tenant,null,'transport.leg_created','transport_leg',_id,
      'team-seffrin-mobility-truth-20261006',
      jsonb_build_object(
        'operation_id',_operation,
        'journey_step_id',_parque_step,
        'reason','Missing return shuttle for Parque Nacional + São Jorge'
      )
    );
  end if;

  if not exists (
    select 1 from public.transport_legs
    where operation_id=_operation
      and tenant_id=_tenant
      and journey_step_id=_morada_step
      and origin_label='Morada do Sol · Chapada dos Veadeiros'
      and destination_label='Alto Paraíso de Goiás · GO'
  ) then
    perform set_config('app.w05_control','on',true);
    insert into public.transport_legs (
      tenant_id,operation_id,journey_step_id,sequence,title,leg_kind,
      plan_origin,origin_label,destination_label,
      planned_departure,planned_arrival,notes,created_by
    ) values (
      _tenant,_operation,_morada_step,35,
      'Morada do Sol → Alto Paraíso',
      'shuttle','planned',
      'Morada do Sol · Chapada dos Veadeiros',
      'Alto Paraíso de Goiás · GO',
      null,null,
      'Retorno do passeio. Horário a confirmar.',
      null
    )
    returning id into _id;
    perform set_config('app.w05_control','off',true);

    perform app_private.record_audit_event(
      _tenant,null,'transport.leg_created','transport_leg',_id,
      'team-seffrin-mobility-truth-20261006',
      jsonb_build_object(
        'operation_id',_operation,
        'journey_step_id',_morada_step,
        'reason','Missing return shuttle for Morada do Sol'
      )
    );
  end if;
end
$$;
