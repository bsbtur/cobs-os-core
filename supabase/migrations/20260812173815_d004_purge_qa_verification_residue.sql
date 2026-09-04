DO $$
DECLARE _t uuid[];
BEGIN
  select coalesce(array_agg(id), '{}') into _t from public.tenants where slug like 'qa-d004-%';
  if array_length(_t,1) is null then return; end if;

  perform set_config('app.op_control','on', true);
  perform set_config('app.w03_control','on', true);
  perform set_config('app.w04_control','on', true);
  perform set_config('app.w05_control','on', true);
  perform set_config('app.w06_control','on', true);
  perform set_config('app.w07_control','on', true);
  perform set_config('app.w08_control','on', true);
  perform set_config('app.w09_control','on', true);
  perform set_config('app.w10_control','on', true);
  set local session_replication_role = replica;

  delete from public.message_deliveries where tenant_id = any(_t);
  delete from public.message_recipients where tenant_id = any(_t);
  delete from public.message_audience_selectors where tenant_id = any(_t);
  delete from public.communication_events where tenant_id = any(_t);
  delete from public.messages where tenant_id = any(_t);

  delete from public.participant_access_invitations where tenant_id = any(_t);
  delete from public.participant_access_grants where tenant_id = any(_t);
  delete from public.participant_presence_events where tenant_id = any(_t);

  delete from public.operation_role_assignments where tenant_id = any(_t);
  delete from public.operation_participations where tenant_id = any(_t);
  delete from public.operation_role_types where tenant_id = any(_t);
  delete from public.journey_events where tenant_id = any(_t);
  delete from public.playbook_executions where tenant_id = any(_t);
  delete from public.playbook_items where tenant_id = any(_t);
  delete from public.journey_steps where tenant_id = any(_t);

  delete from public.operations where tenant_id = any(_t);
  delete from public.offerings where tenant_id = any(_t);
  delete from public.experiences where tenant_id = any(_t);

  delete from public.invitations where tenant_id = any(_t);
  delete from public.memberships where tenant_id = any(_t);
  delete from public.people where tenant_id = any(_t);
  delete from public.idempotency_keys where tenant_id = any(_t);
  delete from public.audit_events where tenant_id = any(_t);
  delete from public.tenants where id = any(_t);

  perform set_config('app.op_control','off', true);
  perform set_config('app.w03_control','off', true);
  perform set_config('app.w04_control','off', true);
  perform set_config('app.w05_control','off', true);
  perform set_config('app.w06_control','off', true);
  perform set_config('app.w07_control','off', true);
  perform set_config('app.w08_control','off', true);
  perform set_config('app.w09_control','off', true);
  set local session_replication_role = origin;
  perform set_config('app.w10_control','off', true);
END $$;