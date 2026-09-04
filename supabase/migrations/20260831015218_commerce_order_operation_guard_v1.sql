create or replace function public.create_order(_tenant_id uuid, _buyer_person_id uuid, _currency text, _operation_id uuid default null::uuid, _reference_label text default null::text, _notes text default null::text, _idempotency_key text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _id uuid;
  _cur char(3);
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _existing jsonb;
  _buyer_name text;
  _operation_status public.operation_status;
begin
  perform app_private.w09_require_order_editor(_tenant_id);
  _cur := app_private.w09_validate_currency(_currency);

  if _key is not null then
    select k.result into _existing
      from public.idempotency_keys k
     where k.actor_profile_id = auth.uid()
       and k.action = 'commerce.order_create'
       and k.idempotency_key = _key;
    if _existing is not null then
      return (_existing->>'order_id')::uuid;
    end if;
  end if;

  select p.full_name into _buyer_name
    from public.people p
   where p.id = _buyer_person_id
     and p.tenant_id = _tenant_id;
  if _buyer_name is null then
    raise exception 'Buyer not found in this organization';
  end if;

  if _operation_id is not null then
    select o.status into _operation_status
      from public.operations o
     where o.id = _operation_id
       and o.tenant_id = _tenant_id;

    if _operation_status is null then
      raise exception 'Operation not found in this organization';
    end if;

    if _operation_status in ('completed'::public.operation_status, 'cancelled'::public.operation_status) then
      raise exception 'Closed operation cannot receive new orders';
    end if;
  end if;

  perform set_config('app.w09_control','on', true);
  insert into public.orders
    (tenant_id, operation_id, buyer_person_id, buyer_name_snapshot, currency,
     reference_label, notes, created_by)
  values (_tenant_id, _operation_id, _buyer_person_id, _buyer_name, _cur,
          app_private.w09_content_guard(_reference_label),
          app_private.w09_content_guard(_notes), auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_tenant_id, auth.uid(), 'commerce.order_create', _key,
            jsonb_build_object('order_id', _id));
  end if;

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'commerce.order_created',
    'order', _id, null, jsonb_build_object('currency', _cur));
  return _id;
end;
$function$;