DO $qa$
declare
  _uid uuid := '00000000-0000-4000-8000-0000def01501';
  _stranger uuid := '00000000-0000-4000-8000-0000def01502';
  _tenant uuid; _exp uuid; _off uuid; _op uuid;
  _v3 uuid; _v1a uuid; _v1b uuid; _v5 uuid;
  _legA uuid; _legB uuid; _legC uuid; _legD uuid; _legN uuid;
  _p uuid[] := '{}'; _pid uuid; _i int;
  _part uuid[] := '{}';
  _res jsonb; _seat1 uuid; _err text; _ok boolean;
begin
  -- QA identities (removed at the end of this block)
  insert into auth.users(id) values (_uid), (_stranger);
  insert into public.profiles(id, display_name) values (_uid,'QA015 Owner'), (_stranger,'QA015 Stranger');

  perform set_config('request.jwt.claims', json_build_object('sub',_uid,'role','authenticated')::text, true);

  _tenant := (public.bootstrap_tenant('QA DEF-PILOT-015','qa-def-pilot-015','BR','pt-BR','America/Sao_Paulo','BRL','qa015-tenant')->>'tenant_id')::uuid;
  _exp := (public.create_experience(_tenant,'QA Exp','qa-exp-015','tourism','qa015-exp')->>'experience_id')::uuid;
  _off := (public.create_offering(_tenant,_exp,'QA Off','qa-off-015','qa015-off')->>'offering_id')::uuid;
  _op := (public.create_operation(_tenant,'QA Operation 015','QA015','tourism','BR','America/Sao_Paulo',
            now()+interval '10 days', now()+interval '10 days 4 hours','qa015-op',_exp,_off)->>'operation_id')::uuid;

  for _i in 1..6 loop
    insert into public.people(tenant_id, full_name) values (_tenant,'QA015 Person '||_i) returning id into _pid;
    _p := _p || _pid;
    _part := _part || ((public.add_operation_participation(_op,_pid,'participant','qa015-part-'||_i)->>'participation_id')::uuid);
  end loop;

  _v3  := (public.create_vehicle(_tenant,'QA Van 3','qa015-v3','van','QA3',3)->>'vehicle_id')::uuid;
  _v1a := (public.create_vehicle(_tenant,'QA Car 1a','qa015-v1a','car','QA1A',1)->>'vehicle_id')::uuid;
  _v1b := (public.create_vehicle(_tenant,'QA Car 1b','qa015-v1b','car','QA1B',1)->>'vehicle_id')::uuid;
  _v5  := (public.create_vehicle(_tenant,'QA Bus 5','qa015-v5','bus','QA5',5)->>'vehicle_id')::uuid;

  _legA := (public.create_transport_leg(_op,'QA Leg A','qa015-legA','outbound')->>'transport_leg_id')::uuid;
  _legB := (public.create_transport_leg(_op,'QA Leg B','qa015-legB','transfer')->>'transport_leg_id')::uuid;
  _legC := (public.create_transport_leg(_op,'QA Leg C','qa015-legC','transfer')->>'transport_leg_id')::uuid;
  _legD := (public.create_transport_leg(_op,'QA Leg D','qa015-legD','transfer')->>'transport_leg_id')::uuid;
  _legN := (public.create_transport_leg(_op,'QA Leg N','qa015-legN','transfer')->>'transport_leg_id')::uuid;
  perform public.assign_vehicle_to_leg(_legA,_v3,'qa');
  perform public.assign_vehicle_to_leg(_legB,_v1a,'qa');
  perform public.assign_vehicle_to_leg(_legC,_v1b,'qa');
  perform public.assign_vehicle_to_leg(_legD,_v5,'qa');
  -- _legN intentionally has no vehicle (unknown capacity)

  -- T1: capacity 3, three assignments succeed
  _seat1 := (public.assign_seat(_legA,_part[1],'qa015-a1','A01')->>'seat_assignment_id')::uuid;
  perform public.assign_seat(_legA,_part[2],'qa015-a2','A02');
  perform public.assign_seat(_legA,_part[3],'qa015-a3','A03');
  if (select count(*) from public.transport_seat_assignments where transport_leg_id=_legA and released_at is null) <> 3
    then raise exception 'T1 FAILED'; end if;

  -- T2: fourth assignment rejected
  begin
    perform public.assign_seat(_legA,_part[4],'qa015-a4','A04');
    raise exception 'T2 FAILED: overcapacity accepted';
  exception when others then
    _err := sqlerrm;
    if _err not like 'Vehicle capacity has been reached for this leg%' then raise exception 'T2 FAILED: %', _err; end if;
  end;

  -- T5: self reassign at full capacity does not double-count
  perform public.assign_seat(_legA,_part[1],'qa015-a1b','A09');
  if (select count(*) from public.transport_seat_assignments where transport_leg_id=_legA and released_at is null) <> 3
    then raise exception 'T5 FAILED'; end if;
  if not exists (select 1 from public.transport_seat_assignments
                 where transport_leg_id=_legA and participation_id=_part[1] and released_at is null and seat_label='A09')
    then raise exception 'T5 FAILED: label not moved'; end if;

  -- T3: release frees capacity
  _seat1 := (select id from public.transport_seat_assignments where transport_leg_id=_legA and participation_id=_part[2] and released_at is null);
  perform public.release_seat(_seat1,'QA release');
  perform public.assign_seat(_legA,_part[4],'qa015-a4b','A04');
  if (select count(*) from public.transport_seat_assignments where transport_leg_id=_legA and released_at is null) <> 3
    then raise exception 'T3 FAILED'; end if;

  -- T4: unlabeled seat consumes capacity (leg B, capacity 1)
  perform public.assign_seat(_legB,_part[1],'qa015-b1',null);
  if (select count(*) from public.transport_seat_assignments where transport_leg_id=_legB and released_at is null and seat_label is null) <> 1
    then raise exception 'T4 FAILED: null label not stored'; end if;
  begin
    perform public.assign_seat(_legB,_part[2],'qa015-b2','B02');
    raise exception 'T4 FAILED: capacity ignored for unlabeled seat';
  exception when others then
    _err := sqlerrm;
    if _err not like 'Vehicle capacity has been reached for this leg%' then raise exception 'T4 FAILED: %', _err; end if;
  end;

  -- T8: different legs are independent (leg C capacity 1 still free)
  perform public.assign_seat(_legC,_part[2],'qa015-c1','C01');
  if (select count(*) from public.transport_seat_assignments where transport_leg_id=_legC and released_at is null) <> 1
    then raise exception 'T8 FAILED'; end if;

  -- T6: duplicate label still returns the seat_active_label_key error (leg D, capacity 5)
  perform public.assign_seat(_legD,_part[1],'qa015-d1','D01');
  begin
    perform public.assign_seat(_legD,_part[2],'qa015-d2','D01');
    raise exception 'T6 FAILED: duplicate label accepted';
  exception when others then
    _err := sqlerrm;
    if _err not like '%seat_active_label_key%' then raise exception 'T6 FAILED: %', _err; end if;
  end;

  -- T9: unknown capacity (no vehicle) keeps frozen behaviour: assignment allowed
  perform public.assign_seat(_legN,_part[1],'qa015-n1','N01');
  perform public.assign_seat(_legN,_part[2],'qa015-n2','N02');
  if (select count(*) from public.transport_seat_assignments where transport_leg_id=_legN and released_at is null) <> 2
    then raise exception 'T9 FAILED'; end if;

  -- T7: the per-leg exclusive advisory lock is actually held by this transaction
  if not exists (
      select 1 from pg_locks l
      where l.locktype='advisory' and l.granted and l.mode='ExclusiveLock'
        and ((l.classid::bigint << 32) | (l.objid::bigint)) = hashtextextended('w05:leg:'||_legA::text,0)
        and l.pid = pg_backend_pid())
    then raise exception 'T7 FAILED: per-leg advisory lock not held'; end if;

  -- T10: authorization regression - a stranger cannot assign seats
  perform set_config('request.jwt.claims', json_build_object('sub',_stranger,'role','authenticated')::text, true);
  begin
    perform public.assign_seat(_legD,_part[3],'qa015-x1','X01');
    raise exception 'T10 FAILED: stranger allowed';
  exception when others then
    _err := sqlerrm;
    if _err not like '%permission%' then raise exception 'T10 FAILED: %', _err; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub',_uid,'role','authenticated')::text, true);

  -- CLEANUP: remove every QA artifact (zero residue)
  set local session_replication_role = 'replica';
  perform set_config('app.w05_control','on', true);
  perform set_config('app.w04_control','on', true);
  perform set_config('app.w03_control','on', true);
  perform set_config('app.w02_control','on', true);
  delete from public.transport_seat_assignments where tenant_id=_tenant;
  delete from public.transport_events where tenant_id=_tenant;
  delete from public.transport_leg_stops where transport_leg_id in (select id from public.transport_legs where tenant_id=_tenant);
  delete from public.transport_legs where tenant_id=_tenant;
  delete from public.vehicles where tenant_id=_tenant;
  delete from public.drivers where tenant_id=_tenant;
  delete from public.operation_role_assignments where tenant_id=_tenant;
  delete from public.operation_participations where tenant_id=_tenant;
  delete from public.journey_events where tenant_id=_tenant;
  delete from public.journey_steps where tenant_id=_tenant;
  delete from public.operations where tenant_id=_tenant;
  delete from public.offerings where tenant_id=_tenant;
  delete from public.experiences where tenant_id=_tenant;
  delete from public.operation_role_types where tenant_id=_tenant;
  delete from public.people where tenant_id=_tenant;
  delete from public.idempotency_keys where tenant_id=_tenant;
  delete from public.audit_events where tenant_id=_tenant;
  delete from public.memberships where tenant_id=_tenant;
  delete from public.invitations where tenant_id=_tenant;
  delete from public.tenants where id=_tenant;
  delete from public.profiles where id in (_uid,_stranger);
  delete from auth.users where id in (_uid,_stranger);
  perform set_config('app.w05_control','off', true);
  perform set_config('app.w04_control','off', true);
  perform set_config('app.w03_control','off', true);
  perform set_config('app.w02_control','off', true);
  set local session_replication_role = 'origin';

  raise notice 'DEF-PILOT-015 QA: all assertions passed';
end
$qa$;