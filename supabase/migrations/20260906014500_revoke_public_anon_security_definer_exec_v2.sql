begin;

revoke execute on function public.add_library_checklist_items_to_step(uuid, uuid[]) from public, anon;
grant execute on function public.add_library_checklist_items_to_step(uuid, uuid[]) to authenticated;

revoke execute on function public.add_library_visit_points_to_step(uuid, uuid[]) from public, anon;
grant execute on function public.add_library_visit_points_to_step(uuid, uuid[]) to authenticated;

revoke execute on function public.get_my_event_program(uuid) from public, anon;
grant execute on function public.get_my_event_program(uuid) to authenticated;

commit;
