-- AUD: preserve the operator-provided reason when a playbook item is deactivated.
-- Authorization remains delegated to update_playbook_item(), which validates
-- authentication and the caller's tenant role before changing the item.

create or replace function public.deactivate_playbook_item(
  _playbook_item_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _why text := nullif(btrim(coalesce(_reason, '')), '');
  _row public.playbook_items;
  _result jsonb;
begin
  if _why is null then
    raise exception 'A reason is required to deactivate a checklist item';
  end if;

  perform app_private.assert_generic_note(_why);

  select *
    into _row
    from public.playbook_items i
   where i.id = _playbook_item_id;

  if _row.id is null then
    raise exception 'Checklist item not found';
  end if;

  -- update_playbook_item is the canonical authorization/write boundary.
  _result := public.update_playbook_item(
    _playbook_item_id := _playbook_item_id,
    _is_active := false
  );

  perform app_private.record_audit_event(
    _row.tenant_id,
    auth.uid(),
    'playbook.item_deactivated',
    'playbook_item',
    _row.id,
    null,
    jsonb_build_object(
      'journey_step_id', _row.journey_step_id,
      'reason', _why
    )
  );

  return _result;
end;
$function$;
