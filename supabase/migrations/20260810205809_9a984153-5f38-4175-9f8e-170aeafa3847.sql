-- ===================================================================
-- COBS OS · W09 — PUBLIC MUTATING COMMANDS (19)
-- ===================================================================

-- 1 --------------------------------------------------- create_sellable
create or replace function public.create_sellable(
  _tenant_id uuid,
  _sellable_kind public.sellable_kind,
  _offering_id uuid default null,
  _name text default null,
  _description text default null,
  _metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _id uuid; _name_clean text;
begin
  perform app_private.w09_require_commerce_manager(_tenant_id);
  _name_clean := app_private.w09_content_guard(_name);
  if _sellable_kind = 'offering' then
    if _offering_id is null then raise exception 'An offering sellable requires an offering'; end if;
    _name_clean := null;
  elsif _name_clean is null then
    raise exception 'A name is required for this kind of sellable';
  end if;

  perform set_config('app.w09_control','on', true);
  insert into public.sellables
    (tenant_id, sellable_kind, offering_id, name, description, metadata, created_by)
  values (_tenant_id, _sellable_kind,
          case when _sellable_kind = 'offering' then _offering_id else null end,
          _name_clean, app_private.w09_content_guard(_description),
          coalesce(_metadata,'{}'::jsonb), auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'commerce.sellable_created',
    'sellable', _id, null, jsonb_build_object('kind', _sellable_kind));
  return _id;
end; $$;

-- 2 --------------------------------------------------- update_sellable
create or replace function public.update_sellable(
  _sellable_id uuid,
  _name text default null,
  _description text default null,
  _metadata jsonb default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.sellables;
begin
  select * into _row from public.sellables s where s.id = _sellable_id;
  if _row.id is null then raise exception 'Sellable not found'; end if;
  perform app_private.w09_require_commerce_manager(_row.tenant_id);
  if _row.status <> 'active' then raise exception 'This sellable is archived'; end if;

  perform set_config('app.w09_control','on', true);
  update public.sellables s
     set name = case when s.sellable_kind = 'offering' then null
                     else coalesce(app_private.w09_content_guard(_name), s.name) end,
         description = coalesce(app_private.w09_content_guard(_description), s.description),
         metadata = coalesce(_metadata, s.metadata)
   where s.id = _sellable_id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'commerce.sellable_updated',
    'sellable', _sellable_id, null, '{}'::jsonb);
  return _sellable_id;
end; $$;

-- 3 -------------------------------------------------- archive_sellable
create or replace function public.archive_sellable(_sellable_id uuid)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.sellables;
begin
  select * into _row from public.sellables s where s.id = _sellable_id;
  if _row.id is null then raise exception 'Sellable not found'; end if;
  perform app_private.w09_require_commerce_manager(_row.tenant_id);
  if _row.status = 'archived' then return _sellable_id; end if;

  perform set_config('app.w09_control','on', true);
  update public.sellables set status = 'archived' where id = _sellable_id;
  update public.prices set status = 'archived'
   where sellable_id = _sellable_id and status = 'active';
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'commerce.sellable_archived',
    'sellable', _sellable_id, null, '{}'::jsonb);
  return _sellable_id;
end; $$;

-- 4 ------------------------------------------------------ create_price
create or replace function public.create_price(
  _sellable_id uuid,
  _currency text,
  _unit_amount_minor bigint,
  _price_basis public.price_basis default 'per_person',
  _description text default null,
  _valid_from timestamptz default null,
  _valid_until timestamptz default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _s public.sellables; _id uuid; _cur char(3);
begin
  select * into _s from public.sellables s where s.id = _sellable_id;
  if _s.id is null then raise exception 'Sellable not found'; end if;
  perform app_private.w09_require_commerce_manager(_s.tenant_id);
  if _s.status <> 'active' then raise exception 'Cannot price an archived sellable'; end if;
  _cur := app_private.w09_validate_currency(_currency);
  if _unit_amount_minor is null or _unit_amount_minor < 0 then
    raise exception 'The unit amount must be zero or more';
  end if;

  perform set_config('app.w09_control','on', true);
  insert into public.prices
    (tenant_id, sellable_id, currency, unit_amount_minor, price_basis, description,
     valid_from, valid_until, created_by)
  values (_s.tenant_id, _sellable_id, _cur, _unit_amount_minor, _price_basis,
          app_private.w09_content_guard(_description),
          coalesce(_valid_from, now()), _valid_until, auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_s.tenant_id, auth.uid(), 'commerce.price_created',
    'price', _id, null, jsonb_build_object('currency', _cur, 'amount_minor', _unit_amount_minor));
  return _id;
end; $$;

-- 5 ------------------------------------------------------- close_price
create or replace function public.close_price(_price_id uuid, _valid_until timestamptz)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.prices;
begin
  select * into _row from public.prices p where p.id = _price_id;
  if _row.id is null then raise exception 'Price not found'; end if;
  perform app_private.w09_require_commerce_manager(_row.tenant_id);
  if _row.status <> 'active' then raise exception 'This price is archived'; end if;
  if _valid_until is null or _valid_until <= _row.valid_from then
    raise exception 'The end of validity must be after the start of validity';
  end if;
  if _row.valid_until is not null then
    raise exception 'This price already has an end of validity';
  end if;

  perform set_config('app.w09_control','on', true);
  update public.prices set valid_until = _valid_until where id = _price_id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'commerce.price_closed',
    'price', _price_id, null, jsonb_build_object('valid_until', _valid_until));
  return _price_id;
end; $$;

-- 6 ----------------------------------------------------- archive_price
create or replace function public.archive_price(_price_id uuid)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.prices;
begin
  select * into _row from public.prices p where p.id = _price_id;
  if _row.id is null then raise exception 'Price not found'; end if;
  perform app_private.w09_require_commerce_manager(_row.tenant_id);
  if _row.status = 'archived' then return _price_id; end if;

  perform set_config('app.w09_control','on', true);
  update public.prices set status = 'archived' where id = _price_id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'commerce.price_archived',
    'price', _price_id, null, '{}'::jsonb);
  return _price_id;
end; $$;

-- 7 ------------------------------------------------------ create_order
create or replace function public.create_order(
  _tenant_id uuid,
  _buyer_person_id uuid,
  _currency text,
  _operation_id uuid default null,
  _reference_label text default null,
  _notes text default null,
  _idempotency_key text default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _id uuid; _cur char(3); _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
        _existing jsonb; _buyer_name text;
begin
  perform app_private.w09_require_order_editor(_tenant_id);
  _cur := app_private.w09_validate_currency(_currency);

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid() and k.action = 'commerce.order_create'
       and k.idempotency_key = _key;
    if _existing is not null then return (_existing->>'order_id')::uuid; end if;
  end if;

  select p.full_name into _buyer_name from public.people p
   where p.id = _buyer_person_id and p.tenant_id = _tenant_id;
  if _buyer_name is null then raise exception 'Buyer not found in this organization'; end if;

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
end; $$;

-- 8 ----------------------------------------------- update_order_details
create or replace function public.update_order_details(
  _order_id uuid,
  _reference_label text default null,
  _notes text default null,
  _operation_id uuid default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.orders;
begin
  select * into _row from public.orders o where o.id = _order_id for update;
  if _row.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_order_editor(_row.tenant_id);
  if _row.status <> 'draft' then
    raise exception 'Only draft orders can be edited';
  end if;

  perform set_config('app.w09_control','on', true);
  update public.orders o
     set reference_label = coalesce(app_private.w09_content_guard(_reference_label), o.reference_label),
         notes = coalesce(app_private.w09_content_guard(_notes), o.notes),
         operation_id = coalesce(_operation_id, o.operation_id)
   where o.id = _order_id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'commerce.order_updated',
    'order', _order_id, null, '{}'::jsonb);
  return _order_id;
end; $$;

-- 9 ---------------------------------------------------- add_order_item
create or replace function public.add_order_item(
  _order_id uuid,
  _sellable_id uuid,
  _quantity integer default 1,
  _discount_minor bigint default 0,
  _beneficiary_person_id uuid default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _o public.orders; _s public.sellables; _p public.prices;
        _sub bigint; _total bigint; _id uuid; _name text; _q integer := coalesce(_quantity,1);
        _disc bigint := coalesce(_discount_minor,0);
begin
  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_order_editor(_o.tenant_id);
  if _o.status <> 'draft' then raise exception 'Items can only change on a draft order'; end if;

  select * into _s from public.sellables s
   where s.id = _sellable_id and s.tenant_id = _o.tenant_id;
  if _s.id is null then raise exception 'Sellable not found in this organization'; end if;
  if _s.status <> 'active' then raise exception 'This sellable is archived'; end if;

  _p := app_private.w09_resolve_active_price(_sellable_id, _o.currency);

  if _q < 1 then raise exception 'Quantity must be at least 1'; end if;
  if _beneficiary_person_id is not null and _q <> 1 then
    raise exception 'An item with an identified beneficiary must have quantity 1';
  end if;
  if _p.price_basis = 'flat' and _q <> 1 then
    raise exception 'A flat-priced item must have quantity 1';
  end if;

  _sub := app_private.w09_checked_mul(_p.unit_amount_minor, _q::bigint);
  if _disc < 0 or _disc > _sub then
    raise exception 'The discount must be between 0 and the line subtotal';
  end if;
  _total := _sub - _disc;

  if _s.sellable_kind = 'offering' then
    select o.name into _name from public.offerings o where o.id = _s.offering_id;
  else
    _name := _s.name;
  end if;

  perform set_config('app.w09_control','on', true);
  insert into public.order_items
    (tenant_id, order_id, sellable_id, price_id, offering_id, sellable_kind,
     sellable_name_snapshot, description_snapshot, price_basis, currency,
     unit_amount_minor, quantity, discount_minor, line_subtotal_minor, line_total_minor,
     beneficiary_person_id, created_by)
  values (_o.tenant_id, _order_id, _sellable_id, _p.id, _s.offering_id, _s.sellable_kind,
          _name, coalesce(_p.description, _s.description), _p.price_basis, _o.currency,
          _p.unit_amount_minor, _q, _disc, _sub, _total,
          _beneficiary_person_id, auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.order_item_added',
    'order_item', _id, null, jsonb_build_object('order_id', _order_id));
  return _id;
end; $$;

-- 10 ------------------------------------------------- update_order_item
create or replace function public.update_order_item(
  _order_item_id uuid,
  _quantity integer default null,
  _discount_minor bigint default null,
  _beneficiary_person_id uuid default null,
  _clear_beneficiary boolean default false)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _i public.order_items; _o public.orders; _q integer; _disc bigint;
        _sub bigint; _ben uuid;
begin
  select * into _i from public.order_items i where i.id = _order_item_id;
  if _i.id is null then raise exception 'Order item not found'; end if;
  select * into _o from public.orders o where o.id = _i.order_id for update;
  perform app_private.w09_require_order_editor(_o.tenant_id);
  if _o.status <> 'draft' then raise exception 'Items can only change on a draft order'; end if;

  _q := coalesce(_quantity, _i.quantity);
  _disc := coalesce(_discount_minor, _i.discount_minor);
  _ben := case when coalesce(_clear_beneficiary,false) then null
               else coalesce(_beneficiary_person_id, _i.beneficiary_person_id) end;

  if _q < 1 then raise exception 'Quantity must be at least 1'; end if;
  if _ben is not null and _q <> 1 then
    raise exception 'An item with an identified beneficiary must have quantity 1';
  end if;
  if _i.price_basis = 'flat' and _q <> 1 then
    raise exception 'A flat-priced item must have quantity 1';
  end if;

  _sub := app_private.w09_checked_mul(_i.unit_amount_minor, _q::bigint);
  if _disc < 0 or _disc > _sub then
    raise exception 'The discount must be between 0 and the line subtotal';
  end if;

  perform set_config('app.w09_control','on', true);
  update public.order_items
     set quantity = _q, discount_minor = _disc,
         line_subtotal_minor = _sub, line_total_minor = _sub - _disc,
         beneficiary_person_id = _ben
   where id = _order_item_id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.order_item_updated',
    'order_item', _order_item_id, null, '{}'::jsonb);
  return _order_item_id;
end; $$;

-- 11 ------------------------------------------------- remove_order_item
create or replace function public.remove_order_item(_order_item_id uuid)
returns boolean language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _i public.order_items; _o public.orders;
begin
  select * into _i from public.order_items i where i.id = _order_item_id;
  if _i.id is null then return false; end if;
  select * into _o from public.orders o where o.id = _i.order_id for update;
  perform app_private.w09_require_order_editor(_o.tenant_id);
  if _o.status <> 'draft' then raise exception 'Items can only change on a draft order'; end if;

  perform set_config('app.w09_control','on', true);
  delete from public.order_items where id = _order_item_id;
  perform set_config('app.w09_control','off', true);

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.order_item_removed',
    'order_item', _order_item_id, null, jsonb_build_object('order_id', _o.id));
  return true;
end; $$;

-- 12 ------------------------------------------------------ submit_order
create or replace function public.submit_order(
  _order_id uuid, _idempotency_key text default null)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _o public.orders; _totals jsonb; _item public.order_items; _n integer;
        _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
begin
  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_order_editor(_o.tenant_id);

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid() and k.action = 'commerce.order_submit'
       and k.idempotency_key = _key;
    if _existing is not null then return _existing; end if;
  end if;

  if _o.status = 'submitted' then
    return jsonb_build_object('order_id', _order_id, 'status', 'submitted', 'unchanged', true);
  end if;
  if _o.status <> 'draft' then
    raise exception 'Only a draft order can be submitted';
  end if;

  select count(*) into _n from public.order_items i where i.order_id = _order_id;
  if _n = 0 then raise exception 'An order must have at least one item before submission'; end if;

  if exists (select 1 from public.order_items i
              where i.order_id = _order_id and i.currency <> _o.currency) then
    raise exception 'All order items must use the order currency';
  end if;

  _totals := app_private.w09_compute_order_totals(_order_id);

  for _item in
    select * from public.order_items i
     where i.order_id = _order_id and i.offering_id is not null
     order by i.offering_id, i.id
  loop
    perform app_private.w09_reserve_or_reacquire(_item, 'reserved');
  end loop;

  perform set_config('app.w09_control','on', true);
  update public.orders
     set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(),
         subtotal_minor = (_totals->>'subtotal_minor')::bigint,
         discount_total_minor = (_totals->>'discount_total_minor')::bigint,
         grand_total_minor = (_totals->>'grand_total_minor')::bigint
   where id = _order_id;
  perform set_config('app.w09_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_o.tenant_id, auth.uid(), 'commerce.order_submit', _key,
            jsonb_build_object('order_id', _order_id, 'status', 'submitted', 'unchanged', false));
  end if;

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.order_submitted',
    'order', _order_id, null, _totals);
  return jsonb_build_object('order_id', _order_id, 'status', 'submitted',
                            'unchanged', false, 'totals', _totals);
end; $$;

-- 13 ----------------------------------------------------- confirm_order
create or replace function public.confirm_order(
  _order_id uuid, _idempotency_key text default null)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _o public.orders; _item public.order_items;
        _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
begin
  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_commerce_manager(_o.tenant_id);

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid() and k.action = 'commerce.order_confirm'
       and k.idempotency_key = _key;
    if _existing is not null then return _existing; end if;
  end if;

  if _o.status = 'confirmed' then
    return jsonb_build_object('order_id', _order_id, 'status', 'confirmed', 'unchanged', true);
  end if;
  if _o.status <> 'submitted' then
    raise exception 'Only a submitted order can be confirmed';
  end if;

  for _item in
    select * from public.order_items i
     where i.order_id = _order_id and i.offering_id is not null
     order by i.offering_id, i.id
  loop
    perform app_private.w09_reserve_or_reacquire(_item, 'confirmed');
  end loop;

  perform set_config('app.w09_control','on', true);
  update public.orders
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
   where id = _order_id;
  perform set_config('app.w09_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_o.tenant_id, auth.uid(), 'commerce.order_confirm', _key,
            jsonb_build_object('order_id', _order_id, 'status', 'confirmed', 'unchanged', false));
  end if;

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.order_confirmed',
    'order', _order_id, null, '{}'::jsonb);
  return jsonb_build_object('order_id', _order_id, 'status', 'confirmed', 'unchanged', false);
end; $$;

-- 14 ------------------------------------------------------ cancel_order
create or replace function public.cancel_order(
  _order_id uuid, _reason text, _idempotency_key text default null)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _o public.orders; _res record; _released integer := 0;
        _reason_clean text; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
        _existing jsonb;
begin
  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_commerce_manager(_o.tenant_id);

  _reason_clean := app_private.w09_content_guard(_reason);
  if _reason_clean is null then raise exception 'A reason is required to cancel an order'; end if;

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid() and k.action = 'commerce.order_cancel'
       and k.idempotency_key = _key;
    if _existing is not null then return _existing; end if;
  end if;

  if _o.status = 'cancelled' then
    return jsonb_build_object('order_id', _order_id, 'status', 'cancelled', 'unchanged', true);
  end if;
  if _o.status = 'completed' then
    raise exception 'A completed order can no longer be cancelled';
  end if;

  for _res in
    select r.id from public.commercial_reservations r
     where r.order_id = _order_id and r.status in ('reserved','confirmed')
     order by r.offering_id, r.id
  loop
    if app_private.w09_release_reservation(_res.id, _reason_clean, true) then
      _released := _released + 1;
    end if;
  end loop;

  perform set_config('app.w09_control','on', true);
  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancellation_reason = _reason_clean
   where id = _order_id;
  perform set_config('app.w09_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_o.tenant_id, auth.uid(), 'commerce.order_cancel', _key,
            jsonb_build_object('order_id', _order_id, 'status', 'cancelled',
                               'unchanged', false, 'released', _released));
  end if;

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.order_cancelled',
    'order', _order_id, null, jsonb_build_object('released_reservations', _released));
  return jsonb_build_object('order_id', _order_id, 'status', 'cancelled',
                            'unchanged', false, 'released', _released);
end; $$;

-- 15 ---------------------------------------------------- complete_order
create or replace function public.complete_order(
  _order_id uuid, _idempotency_key text default null)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _o public.orders; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
        _existing jsonb;
begin
  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_commerce_manager(_o.tenant_id);

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid() and k.action = 'commerce.order_complete'
       and k.idempotency_key = _key;
    if _existing is not null then return _existing; end if;
  end if;

  if _o.status = 'completed' then
    return jsonb_build_object('order_id', _order_id, 'status', 'completed', 'unchanged', true);
  end if;
  if _o.status <> 'confirmed' then
    raise exception 'Only a confirmed order can be completed';
  end if;

  perform set_config('app.w09_control','on', true);
  update public.orders
     set status = 'completed', completed_at = now(), completed_by = auth.uid()
   where id = _order_id;
  perform set_config('app.w09_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_o.tenant_id, auth.uid(), 'commerce.order_complete', _key,
            jsonb_build_object('order_id', _order_id, 'status', 'completed', 'unchanged', false));
  end if;

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.order_completed',
    'order', _order_id, null, '{}'::jsonb);
  return jsonb_build_object('order_id', _order_id, 'status', 'completed', 'unchanged', false);
end; $$;

-- 16 --------------------------------- release_commercial_reservation
create or replace function public.release_commercial_reservation(
  _reservation_id uuid, _reason text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.commercial_reservations; _changed boolean;
begin
  select * into _row from public.commercial_reservations r where r.id = _reservation_id;
  if _row.id is null then raise exception 'Reservation not found'; end if;
  perform app_private.w09_require_order_editor(_row.tenant_id);

  _changed := app_private.w09_release_reservation(_reservation_id, _reason, false);

  if _changed then
    perform app_private.record_audit_event(_row.tenant_id, auth.uid(),
      'commerce.reservation_released', 'commercial_reservation', _reservation_id, null,
      jsonb_build_object('order_id', _row.order_id));
  end if;
  return jsonb_build_object('reservation_id', _reservation_id, 'unchanged', not _changed);
end; $$;

-- 17 ----------------------------------------------------- record_payment
create or replace function public.record_payment(
  _order_id uuid,
  _amount_minor bigint,
  _method public.payment_method,
  _reference text,
  _reason text,
  _occurred_at timestamptz default null,
  _idempotency_key text default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _o public.orders; _id uuid; _ref text; _rsn text; _at timestamptz;
        _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
begin
  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_finance_manager(_o.tenant_id);

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid() and k.action = 'commerce.payment_record'
       and k.idempotency_key = _key;
    if _existing is not null then return (_existing->>'fact_id')::uuid; end if;
  end if;

  if _o.status not in ('submitted','confirmed','completed') then
    raise exception 'A payment can only be recorded against a submitted, confirmed or completed order';
  end if;
  if _amount_minor is null or _amount_minor <= 0 then
    raise exception 'The payment amount must be greater than zero';
  end if;
  if _method is null then raise exception 'A payment method is required'; end if;

  _ref := app_private.w09_content_guard(_reference);
  if _ref is null then raise exception 'An evidence reference is required'; end if;
  _rsn := app_private.w09_content_guard(_reason);
  if _rsn is null then raise exception 'A reason is required'; end if;

  _at := coalesce(_occurred_at, now());
  if _at > now() then raise exception 'A payment cannot be recorded in the future'; end if;

  perform 1 from public.financial_facts f where f.order_id = _order_id for update;

  perform set_config('app.w09_control','on', true);
  insert into public.financial_facts
    (tenant_id, order_id, fact_type, amount_minor, currency, method, reference, reason,
     occurred_at, actor_profile_id)
  values (_o.tenant_id, _order_id, 'PAYMENT_RECORDED', _amount_minor, _o.currency,
          _method, _ref, _rsn, _at, auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_o.tenant_id, auth.uid(), 'commerce.payment_record', _key,
            jsonb_build_object('fact_id', _id));
  end if;

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.payment_recorded',
    'financial_fact', _id, null, jsonb_build_object('order_id', _order_id,
      'amount_minor', _amount_minor, 'method', _method));
  return _id;
end; $$;

-- 18 ---------------------------------------------------- reverse_payment
create or replace function public.reverse_payment(
  _payment_fact_id uuid,
  _reason text,
  _reference text,
  _occurred_at timestamptz default null,
  _idempotency_key text default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _p public.financial_facts; _o public.orders; _id uuid; _ref text; _rsn text;
        _at timestamptz; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
        _existing jsonb;
begin
  select * into _p from public.financial_facts f where f.id = _payment_fact_id;
  if _p.id is null then raise exception 'Payment not found'; end if;
  select * into _o from public.orders o where o.id = _p.order_id for update;
  perform app_private.w09_require_finance_manager(_o.tenant_id);

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid() and k.action = 'commerce.payment_reverse'
       and k.idempotency_key = _key;
    if _existing is not null then return (_existing->>'fact_id')::uuid; end if;
  end if;

  if _p.fact_type <> 'PAYMENT_RECORDED' then
    raise exception 'Only a recorded payment can be reversed';
  end if;

  perform 1 from public.financial_facts f where f.order_id = _o.id for update;

  if exists (select 1 from public.financial_facts f
              where f.references_fact_id = _payment_fact_id
                and f.fact_type = 'PAYMENT_REVERSED') then
    raise exception 'This payment has already been reversed';
  end if;
  if exists (select 1 from public.financial_facts f
              where f.references_fact_id = _payment_fact_id
                and f.fact_type = 'REFUND_RECORDED') then
    raise exception 'This payment has refunds and can no longer be reversed';
  end if;

  _ref := app_private.w09_content_guard(_reference);
  if _ref is null then raise exception 'An evidence reference is required'; end if;
  _rsn := app_private.w09_content_guard(_reason);
  if _rsn is null then raise exception 'A reason is required'; end if;
  _at := coalesce(_occurred_at, now());
  if _at > now() then raise exception 'A correction cannot be recorded in the future'; end if;

  perform set_config('app.w09_control','on', true);
  insert into public.financial_facts
    (tenant_id, order_id, fact_type, amount_minor, currency, reference, reason,
     references_fact_id, occurred_at, actor_profile_id)
  values (_o.tenant_id, _o.id, 'PAYMENT_REVERSED', _p.amount_minor, _p.currency,
          _ref, _rsn, _payment_fact_id, _at, auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_o.tenant_id, auth.uid(), 'commerce.payment_reverse', _key,
            jsonb_build_object('fact_id', _id));
  end if;

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.payment_reversed',
    'financial_fact', _id, null, jsonb_build_object('payment_fact_id', _payment_fact_id));
  return _id;
end; $$;

-- 19 ----------------------------------------------------- record_refund
create or replace function public.record_refund(
  _payment_fact_id uuid,
  _amount_minor bigint,
  _reason text,
  _reference text,
  _occurred_at timestamptz default null,
  _idempotency_key text default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _p public.financial_facts; _o public.orders; _id uuid; _ref text; _rsn text;
        _at timestamptz; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
        _existing jsonb;
begin
  select * into _p from public.financial_facts f where f.id = _payment_fact_id;
  if _p.id is null then raise exception 'Payment not found'; end if;
  select * into _o from public.orders o where o.id = _p.order_id for update;
  perform app_private.w09_require_finance_manager(_o.tenant_id);

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid() and k.action = 'commerce.refund_record'
       and k.idempotency_key = _key;
    if _existing is not null then return (_existing->>'fact_id')::uuid; end if;
  end if;

  if _amount_minor is null or _amount_minor <= 0 then
    raise exception 'The refund amount must be greater than zero';
  end if;

  perform 1 from public.financial_facts f where f.order_id = _o.id for update;
  perform app_private.w09_assert_refund_allowed(_o.id, _payment_fact_id, _amount_minor);

  _ref := app_private.w09_content_guard(_reference);
  if _ref is null then raise exception 'An evidence reference is required'; end if;
  _rsn := app_private.w09_content_guard(_reason);
  if _rsn is null then raise exception 'A reason is required'; end if;
  _at := coalesce(_occurred_at, now());
  if _at > now() then raise exception 'A refund cannot be recorded in the future'; end if;

  perform set_config('app.w09_control','on', true);
  insert into public.financial_facts
    (tenant_id, order_id, fact_type, amount_minor, currency, reference, reason,
     references_fact_id, occurred_at, actor_profile_id)
  values (_o.tenant_id, _o.id, 'REFUND_RECORDED', _amount_minor, _p.currency,
          _ref, _rsn, _payment_fact_id, _at, auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_o.tenant_id, auth.uid(), 'commerce.refund_record', _key,
            jsonb_build_object('fact_id', _id));
  end if;

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.refund_recorded',
    'financial_fact', _id, null, jsonb_build_object('payment_fact_id', _payment_fact_id,
      'amount_minor', _amount_minor));
  return _id;
end; $$;

-- ================================================================= ACLs
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('create_sellable','update_sellable','archive_sellable',
                'create_price','close_price','archive_price','create_order',
                'update_order_details','add_order_item','update_order_item',
                'remove_order_item','submit_order','confirm_order','cancel_order',
                'complete_order','release_commercial_reservation','record_payment',
                'reverse_payment','record_refund') loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;