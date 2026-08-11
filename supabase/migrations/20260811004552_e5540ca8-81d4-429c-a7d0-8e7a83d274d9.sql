CREATE OR REPLACE FUNCTION public.reinstate_operation(_operation_id uuid, _reason text, _idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
  _existing jsonb;
  _result jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _idempotency_key is null then raise exception 'An idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to reinstate an operation'; end if;
  perform app_private.assert_generic_note(_why);

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid
      and k.action = 'operation.reinstate'
      and k.idempotency_key = _idempotency_key::text;
  if _existing is not null then return _existing; end if;

  select * into _op from public.operations o where o.id = _operation_id for update;
  -- Governance action: owner only. Generic message across tenants.
  if _op.id is null
     or not app_private.has_tenant_role(_op.tenant_id, array['owner']::public.app_role[]) then
    raise exception 'Operation not found';
  end if;

  if _op.status <> 'cancelled' then
    raise exception 'Only a cancelled operation can be reinstated';
  end if;

  -- The frozen operations_cancelled_consistency invariant requires the cancellation
  -- stamp to exist only while status = 'cancelled'. The cancellation evidence is
  -- therefore preserved immutably in audit_events, not on the mutable row.
  perform set_config('app.op_control', 'on', true);
  update public.operations
     set status = 'planning',
         cancelled_at = null,
         cancellation_reason = null
   where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(_op.tenant_id, _uid, 'operation.reinstated',
    'operation', _op.id, _idempotency_key::text,
    jsonb_build_object('from_status', 'cancelled', 'to_status', 'planning',
                       'reason', _why,
                       'original_cancelled_at', _op.cancelled_at,
                       'original_cancellation_reason', _op.cancellation_reason));

  _result := jsonb_build_object('operation_id', _op.id, 'status', 'planning',
                                'previous_status', 'cancelled',
                                'original_cancelled_at', _op.cancelled_at);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, _uid, 'operation.reinstate', _idempotency_key::text, _result);
  return _result;
end;
$function$;

REVOKE ALL ON FUNCTION public.reinstate_operation(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reinstate_operation(uuid, text, uuid) TO authenticated;