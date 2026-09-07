-- COBS OS · Contract document renderer integrity v1
-- Keeps reviewed contract source immutable and makes upload readiness specific to the implemented renderer.
-- No template is activated, no legal evidence is created, no contract is rendered and no provider is called.

create or replace function app_private.guard_contract_template_reviewed_document_immutability()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if old.legal_reviewed_at is not null
     and (
       new.document_source_snapshot is distinct from old.document_source_snapshot
       or new.document_source_hash is distinct from old.document_source_hash
       or new.document_renderer_version is distinct from old.document_renderer_version
     ) then
    raise exception 'reviewed_contract_document_source_immutable';
  end if;

  if old.status='active'
     and (
       new.document_source_snapshot is distinct from old.document_source_snapshot
       or new.document_source_hash is distinct from old.document_source_hash
       or new.document_renderer_version is distinct from old.document_renderer_version
     ) then
    raise exception 'active_contract_document_source_immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_contract_template_reviewed_document_immutability() from public;

drop trigger if exists contract_templates_reviewed_document_immutability on public.contract_templates;
create trigger contract_templates_reviewed_document_immutability
before update of document_source_snapshot,document_source_hash,document_renderer_version,legal_reviewed_at,status
on public.contract_templates
for each row execute function app_private.guard_contract_template_reviewed_document_immutability();

create or replace function public.get_contract_document_pipeline_readiness(
  _operation_id uuid,
  _template_key text default 'CIOSP-2027'
) returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_operation public.operations%rowtype;
  v_template record;
  v_template_key text := nullif(btrim(coalesce(_template_key,'')),'');
  v_mode text;
  v_source text;
  v_hash text;
  v_expected_hash text;
  v_renderer_version text;
  v_provider_template_id text;
  v_source_valid boolean := false;
  v_renderer_supported boolean := false;
  v_ready boolean := false;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_template_key is null then raise exception 'template_key_required'; end if;

  select * into v_operation from public.operations where id=_operation_id;
  if not found then raise exception 'operation_not_found'; end if;
  if not app_private.has_tenant_role(
    v_operation.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then raise exception 'forbidden'; end if;

  select ct.id,ct.version,ct.status,ct.provider,ct.provider_template_id,ct.metadata,
         ct.document_source_snapshot,ct.document_source_hash,ct.document_renderer_version
  into v_template
  from public.contract_templates ct
  where ct.tenant_id=v_operation.tenant_id and ct.template_key=v_template_key
  order by case when ct.version='V3.1' then 0 else 1 end,ct.created_at desc
  limit 1;

  if v_template.id is null then
    return jsonb_build_object('ready',false,'status','blocked','mode','missing','detail','contract_template_missing');
  end if;

  v_mode := nullif(btrim(coalesce(v_template.metadata->>'provider_document_mode','')),'');
  v_source := nullif(btrim(coalesce(v_template.document_source_snapshot,'')),'');
  v_hash := nullif(btrim(coalesce(v_template.document_source_hash,'')),'');
  v_renderer_version := nullif(btrim(coalesce(v_template.document_renderer_version,'')),'');
  v_provider_template_id := nullif(btrim(coalesce(v_template.provider_template_id,'')),'');
  v_renderer_supported := v_renderer_version='pdf-lib-v1';

  if v_source is not null and char_length(v_source) >= 200 then
    v_expected_hash := encode(digest(convert_to(v_source,'UTF8'),'sha256'),'hex');
    v_source_valid := v_hash is not null and lower(v_hash)=v_expected_hash;
  end if;

  if v_mode='upload' then
    v_ready := v_source_valid and v_renderer_supported;
  elsif v_mode='provider_template' then
    v_ready := v_provider_template_id is not null;
  end if;

  return jsonb_build_object(
    'ready',v_ready,
    'status',case when v_ready then 'ready' else 'blocked' end,
    'mode',coalesce(v_mode,'missing'),
    'template_version',v_template.version,
    'document_source_frozen',v_source is not null,
    'document_source_hash_valid',v_source_valid,
    'renderer_version',v_renderer_version,
    'renderer_supported',v_renderer_supported,
    'provider_template_configured',v_provider_template_id is not null,
    'detail',case
      when v_mode='upload' and v_source is null then 'document_source_not_registered'
      when v_mode='upload' and not v_source_valid then 'document_source_hash_invalid'
      when v_mode='upload' and v_renderer_version is null then 'upload_renderer_not_registered'
      when v_mode='upload' and not v_renderer_supported then 'upload_renderer_not_supported'
      when v_mode='provider_template' and v_provider_template_id is null then 'provider_template_not_configured'
      when v_mode is null then 'provider_document_mode_missing'
      when v_ready then 'document_pipeline_configured'
      else 'document_pipeline_not_configured'
    end,
    'note','Diagnóstico somente leitura. Não gera PDF nem chama provedor.'
  );
end;
$$;

revoke all on function public.get_contract_document_pipeline_readiness(uuid,text) from public,anon;
grant execute on function public.get_contract_document_pipeline_readiness(uuid,text) to authenticated,service_role;
