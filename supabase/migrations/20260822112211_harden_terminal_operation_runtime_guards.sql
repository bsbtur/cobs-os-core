create or replace function app_private.w05_assert_open(_leg public.transport_legs)
returns void
language plpgsql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  perform app_private.assert_operation_not_closed(_leg.operation_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'This transport leg already departed. Create a new ad-hoc leg instead of rewriting history.';
  end if;
end;
$function$;

create or replace function app_private.w07_assert_event_non_terminal(_event public.events)
returns void
language plpgsql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  perform app_private.assert_operation_not_closed(_event.operation_id);
  if _event.status = 'closed_out' then
    raise exception 'This event is closed and can no longer be changed';
  end if;
end;
$function$;