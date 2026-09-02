do $$
declare _p record;
begin
  for _p in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
        'create_vehicle','update_vehicle','set_vehicle_active',
        'create_driver','update_driver','set_driver_active',
        'create_transport_leg','create_ad_hoc_transport_leg','update_transport_leg',
        'set_transport_leg_planned_window','set_transport_leg_expected_window',
        'cancel_transport_leg','link_transport_leg_to_journey_step',
        'add_transport_leg_stop','update_transport_leg_stop','remove_transport_leg_stop',
        'assign_vehicle_to_leg','assign_driver_to_leg','clear_leg_assignment',
        'request_vehicle','record_vehicle_en_route_to_pickup','record_vehicle_at_pickup',
        'record_leg_departed','record_stop_reached','record_destination_arrived',
        'set_return_time','assign_seat','release_seat','note_transport_incident',
        'w05_leg_dispatch_state','w05_leg_manifest','w05_leg_seat_candidates',
        'w05_operation_mobility',
        'guard_w05_mutation','guard_w05_append_only','guard_transport_leg_baseline')
  loop
    execute format('revoke all on function public.%I(%s) from public, anon', _p.proname, _p.args);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', _p.proname, _p.args);
  end loop;

  -- guards are trigger-only: no application role needs EXECUTE
  for _p in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('guard_w05_mutation','guard_w05_append_only','guard_transport_leg_baseline')
  loop
    execute format('revoke all on function public.%I(%s) from authenticated', _p.proname, _p.args);
  end loop;
end $$;