begin;

revoke execute on function public.add_library_checklist_items_to_step(uuid, uuid[]) from anon;
revoke execute on function public.add_library_visit_points_to_step(uuid, uuid[]) from anon;
revoke execute on function public.get_my_event_program(uuid) from anon;
revoke execute on function public.reopen_operation(uuid, text) from anon;
revoke execute on function public.reorder_playbook_items(uuid, uuid[]) from anon;
revoke execute on function public.set_event_schedule_precision(uuid, text, text) from anon;

commit;
