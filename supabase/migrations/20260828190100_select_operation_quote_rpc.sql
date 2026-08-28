create or replace function public.select_operation_quote(_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  _uid uuid := auth.uid();
  _q public.operation_quotes;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  select * into _q from public.operation_quotes where id=_quote_id for update;
  if _q.id is null then raise exception 'Quote not found'; end if;
  if not app_private.has_tenant_role(_q.tenant_id,array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can select procurement quotes';
  end if;

  update public.operation_quotes
  set status='shortlisted',selected_at=null,updated_at=now()
  where operation_id=_q.operation_id and category=_q.category and id<>_q.id and status='selected';

  update public.operation_quotes
  set status='selected',selected_at=now(),updated_at=now()
  where id=_q.id;

  perform app_private.record_audit_event(_q.tenant_id,_uid,'procurement.quote_selected','operation_quote',_q.id,null,jsonb_build_object('operation_id',_q.operation_id,'category',_q.category,'amount_minor',_q.amount_minor));
  return jsonb_build_object('quote_id',_q.id,'status','selected');
end;
$$;

grant execute on function public.select_operation_quote(uuid) to authenticated;
