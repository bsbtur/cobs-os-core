-- Allow approved hospitality property updates to merge structured metadata.
-- Keeps the existing authorization, idempotency, audit and mutation guard path.

drop function if exists public.update_hospitality_property(
  uuid,
  text,
  text,
  public.hospitality_property_kind,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

create or replace function public.update_hospitality_property(
  _property_id uuid,
  _idempotency_key text,
  _name text default null,
  _property_kind public.hospitality_property_kind default null,
  _country_code text default null,
  _region text default null,
  _city text default null,
  _address_label text default null,
  _timezone text default null,
  _contact_label text default null,
  _notes text default null,
  _metadata jsonb default null
)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare
  _row public.hospitality_properties;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _out jsonb;
begin
  _row := app_private.w06_property(_property_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;

  _out := app_private.w06_replay('hospitality.property.update', _key);
  if _out is not null then return _out; end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  if _metadata is not null and jsonb_typeof(_metadata) <> 'object' then
    raise exception 'Property metadata must be a JSON object';
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_properties set
    name = coalesce(nullif(btrim(coalesce(_name,'')),''), name),
    property_kind = coalesce(_property_kind, property_kind),
    country_code = coalesce(upper(nullif(btrim(coalesce(_country_code,'')),'')), country_code),
    region = coalesce(nullif(btrim(coalesce(_region,'')),''), region),
    city = coalesce(nullif(btrim(coalesce(_city,'')),''), city),
    address_label = coalesce(nullif(btrim(coalesce(_address_label,'')),''), address_label),
    timezone = coalesce(nullif(btrim(coalesce(_timezone,'')),''), timezone),
    contact_label = coalesce(nullif(btrim(coalesce(_contact_label,'')),''), contact_label),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes),
    metadata = case
      when _metadata is null then metadata
      else coalesce(metadata, '{}'::jsonb) || _metadata
    end
  where id = _property_id
  returning * into _row;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(
    _row.tenant_id,
    auth.uid(),
    'hospitality.property.updated',
    'hospitality_property',
    _row.id,
    _key,
    jsonb_build_object('metadata_updated', _metadata is not null)
  );

  _out := jsonb_build_object('property_id', _row.id);
  perform app_private.w06_claim_key(
    _row.tenant_id,
    'hospitality.property.update',
    _key,
    _out
  );
  return _out;
end;
$$;

revoke all on function public.update_hospitality_property(
  uuid,
  text,
  text,
  public.hospitality_property_kind,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon;

grant execute on function public.update_hospitality_property(
  uuid,
  text,
  text,
  public.hospitality_property_kind,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;
