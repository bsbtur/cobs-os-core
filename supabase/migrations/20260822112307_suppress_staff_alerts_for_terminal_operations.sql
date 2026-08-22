create or replace function public.generate_due_staff_journey_alerts(_tenant_id uuid, _window_start timestamptz default (now() - interval '5 minutes'), _window_end timestamptz default (now() + interval '1 minute'))
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _candidate record;
  _message public.messages;
  _recipient_id uuid;
  _delivery_id uuid;
  _correlation text;
  _alert_key text;
  _title text;
  _body text;
  _created int := 0;
  _skipped_duplicate int := 0;
  _skipped_ineligible int := 0;
  _role_label text;
  _time_label text;
begin
  if _tenant_id is null then raise exception 'tenant_id is required'; end if;
  if _window_start is null or _window_end is null or _window_end <= _window_start then raise exception 'Invalid alert generation window'; end if;
  if _window_end - _window_start > interval '2 hours' then raise exception 'Alert generation window cannot exceed 2 hours'; end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    perform app_private.w08_require_comms_operator(_tenant_id);
  end if;

  for _candidate in
    with milestones as (
      select a.id assignment_id, a.tenant_id, a.operation_id, a.participation_id, a.role_type_id,
             p.person_id, op.name operation_name, op.timezone operation_timezone, rt.label role_label,
             'report_at'::text milestone, a.report_at milestone_at, a.report_at - interval '15 minutes' alert_at
      from public.operation_staff_assignments a
      join public.operation_participations p on p.id=a.participation_id
      join public.operations op on op.id=a.operation_id
      join public.operation_role_types rt on rt.id=a.role_type_id
      where a.tenant_id=_tenant_id and op.status not in ('completed','cancelled')
        and a.status in ('assigned','confirmed') and a.report_at is not null
      union all
      select a.id, a.tenant_id, a.operation_id, a.participation_id, a.role_type_id,
             p.person_id, op.name, op.timezone, rt.label,
             'starts_at'::text, a.starts_at, a.starts_at - interval '15 minutes'
      from public.operation_staff_assignments a
      join public.operation_participations p on p.id=a.participation_id
      join public.operations op on op.id=a.operation_id
      join public.operation_role_types rt on rt.id=a.role_type_id
      where a.tenant_id=_tenant_id and op.status not in ('completed','cancelled')
        and a.status in ('assigned','confirmed') and a.starts_at is not null
      union all
      select a.id, a.tenant_id, a.operation_id, a.participation_id, a.role_type_id,
             p.person_id, op.name, op.timezone, rt.label,
             'ends_at'::text, a.ends_at, a.ends_at - interval '15 minutes'
      from public.operation_staff_assignments a
      join public.operation_participations p on p.id=a.participation_id
      join public.operations op on op.id=a.operation_id
      join public.operation_role_types rt on rt.id=a.role_type_id
      where a.tenant_id=_tenant_id and op.status not in ('completed','cancelled')
        and a.status in ('assigned','confirmed') and a.ends_at is not null
    )
    select * from milestones
    where alert_at >= _window_start and alert_at < _window_end
    order by alert_at, assignment_id, milestone
  loop
    if not exists (
      select 1 from app_private.w08_in_app_eligible_recipients(
        _candidate.tenant_id, _candidate.operation_id, array[_candidate.person_id]::uuid[]
      ) e where e.person_id=_candidate.person_id
    ) then
      _skipped_ineligible := _skipped_ineligible + 1;
      continue;
    end if;

    _alert_key := format('staff-alert:%s:%s:%s', _candidate.assignment_id, _candidate.milestone,
      to_char(_candidate.milestone_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));

    if exists (select 1 from public.messages m where m.tenant_id=_tenant_id and m.metadata->>'staff_alert_key'=_alert_key) then
      _skipped_duplicate := _skipped_duplicate + 1;
      continue;
    end if;

    _role_label := coalesce(nullif(btrim(_candidate.role_label),''),'Equipe');
    _time_label := to_char(_candidate.milestone_at at time zone coalesce(nullif(_candidate.operation_timezone,''),'America/Sao_Paulo'),'HH24:MI');

    if _candidate.milestone='report_at' then
      _title := 'Apresentação em 15 minutos';
      _body := format('Sua apresentação para %s é às %s.', _candidate.operation_name, _time_label);
    elsif _candidate.milestone='starts_at' then
      _title := 'Seu trabalho começa em 15 minutos';
      _body := format('Seu trabalho como %s em %s começa às %s.', _role_label, _candidate.operation_name, _time_label);
    else
      _title := 'Sua escala termina em 15 minutos';
      _body := format('Faltam 15 minutos para o fim da sua escala como %s em %s.', _role_label, _candidate.operation_name);
    end if;

    _correlation := gen_random_uuid()::text;
    begin
      perform set_config('app.w08_control','on',true);
      insert into public.messages (tenant_id,operation_id,kind,priority,status,title,body,locale,published_at,created_by,published_by,recipient_count,in_app_reachable_count,metadata)
      values (_candidate.tenant_id,_candidate.operation_id,'reminder'::public.message_kind,'normal'::public.message_priority,'published',_title,_body,'pt-BR',now(),auth.uid(),auth.uid(),1,1,
        jsonb_build_object('source','px12_staff_journey_alert','staff_alert_key',_alert_key,'staff_assignment_id',_candidate.assignment_id,'milestone',_candidate.milestone,'milestone_at',_candidate.milestone_at,'alert_at',_candidate.alert_at,'role_type_id',_candidate.role_type_id))
      returning * into _message;
      insert into public.message_audience_selectors (tenant_id,message_id,selector_kind,person_id,created_by)
      values (_candidate.tenant_id,_message.id,'explicit_person',_candidate.person_id,auth.uid());
      insert into public.message_recipients (tenant_id,message_id,person_id,in_app_eligible)
      values (_candidate.tenant_id,_message.id,_candidate.person_id,true) returning id into _recipient_id;
      insert into public.message_deliveries (tenant_id,message_id,recipient_id,person_id,channel,status,delivered_at)
      values (_candidate.tenant_id,_message.id,_recipient_id,_candidate.person_id,'in_app','delivered',now()) returning id into _delivery_id;
      perform set_config('app.w08_control','off',true);

      perform app_private.w08_record_communication_event(_message,'MESSAGE_PUBLISHED',_candidate.person_id,_recipient_id,null,
        jsonb_build_object('source','px12_staff_journey_alert','milestone',_candidate.milestone,'staff_assignment_id',_candidate.assignment_id),_correlation);
      perform app_private.w08_record_communication_event(_message,'IN_APP_DELIVERY_CREATED',_candidate.person_id,_recipient_id,_delivery_id,
        jsonb_build_object('channel','in_app','source','px12_staff_journey_alert'),_correlation);
      perform app_private.record_audit_event(_candidate.tenant_id,auth.uid(),'px12.staff_alert_generated','message',_message.id,_alert_key,
        jsonb_build_object('assignment_id',_candidate.assignment_id,'person_id',_candidate.person_id,'milestone',_candidate.milestone,'milestone_at',_candidate.milestone_at));
      _created := _created + 1;
    exception when unique_violation then
      perform set_config('app.w08_control','off',true);
      _skipped_duplicate := _skipped_duplicate + 1;
    end;
  end loop;

  return jsonb_build_object('tenant_id',_tenant_id,'window_start',_window_start,'window_end',_window_end,'created',_created,'skipped_duplicate',_skipped_duplicate,'skipped_ineligible',_skipped_ineligible);
end;
$function$;