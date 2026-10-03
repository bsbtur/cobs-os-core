-- COBS OS · Contract document source digest schema hardening v1
-- Qualifies pgcrypto digest calls used by the template source guard and registration RPC.
-- No document source, legal review, template status, contract, PDF or provider state is changed.

create or replace function app_private.guard_contract_template_upload_document_source()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_source text;
  v_expected_hash text;
  v_mode text;
begin
  v_mode := nullif(btrim(coalesce(new.metadata->>'provider_document_mode','')),'');

  if new.template_key='CIOSP-2027'
     and new.status='active'
     and v_mode='upload' then
    v_source := nullif(btrim(coalesce(new.document_source_snapshot,'')),'');

    if v_source is null or char_length(v_source) < 200 then
      raise exception 'contract_document_source_required';
    end if;

    v_expected_hash := encode(
      extensions.digest(convert_to(v_source,'UTF8'),'sha256'),
      'hex'
    );

    if nullif(btrim(coalesce(new.document_source_hash,'')),'') is null
       or lower(new.document_source_hash) <> v_expected_hash then
      raise exception 'contract_document_source_hash_mismatch';
    end if;

    if nullif(btrim(coalesce(new.document_renderer_version,'')),'') is null then
      raise exception 'contract_document_renderer_required';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_contract_template_upload_document_source() from public;

create or replace function public.register_contract_document_source_draft(
  _template_id uuid,
  _document_source_snapshot text,
  _renderer_version text
) returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_template public.contract_templates%rowtype;
  v_source text := nullif(btrim(coalesce(_document_source_snapshot,'')),'');
  v_renderer text := nullif(btrim(coalesce(_renderer_version,'')),'');
  v_hash text;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_template
  from public.contract_templates
  where id=_template_id
  for update;
  if not found then raise exception 'contract_template_not_found'; end if;

  if not app_private.has_tenant_role(
    v_template.tenant_id,
    array['owner','admin']::public.app_role[]
  ) then raise exception 'forbidden'; end if;

  if v_template.status not in ('draft','review_required')
     or v_template.legal_reviewed_at is not null then
    raise exception 'contract_document_source_registration_closed';
  end if;

  if v_source is null or char_length(v_source) < 200 then
    raise exception 'contract_document_source_required';
  end if;
  if v_renderer is null then raise exception 'contract_document_renderer_required'; end if;

  v_hash := encode(extensions.digest(convert_to(v_source,'UTF8'),'sha256'),'hex');

  update public.contract_templates
  set document_source_snapshot=v_source,
      document_source_hash=v_hash,
      document_renderer_version=v_renderer,
      updated_at=now()
  where id=v_template.id;

  perform app_private.record_audit_event(
    v_template.tenant_id,
    v_uid,
    'contract_template.document_source_registered',
    'contract_template',
    v_template.id,
    null,
    jsonb_build_object(
      'template_key',v_template.template_key,
      'template_version',v_template.version,
      'document_source_hash',v_hash,
      'renderer_version',v_renderer,
      'status',v_template.status,
      'formal_legal_review_recorded',false
    )
  );

  return jsonb_build_object(
    'template_id',v_template.id,
    'template_key',v_template.template_key,
    'template_version',v_template.version,
    'status',v_template.status,
    'document_source_hash',v_hash,
    'renderer_version',v_renderer,
    'legal_reviewed_at',null
  );
end;
$$;

revoke all on function public.register_contract_document_source_draft(uuid,text,text) from public,anon;
grant execute on function public.register_contract_document_source_draft(uuid,text,text) to authenticated,service_role;

comment on function public.register_contract_document_source_draft(uuid,text,text) is
  'Registers an exact draft/review-required contract document source and computes SHA-256 server-side. It never records legal approval or activates the template.';
