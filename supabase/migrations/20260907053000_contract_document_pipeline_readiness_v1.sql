-- COBS OS · Contract document pipeline readiness v1
-- Read-only diagnostic for the contract document/render path.
-- It does not render documents, mutate contracts, call providers or activate legal evidence.

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
  v_renderer_version text;
  v_provider_template_id text;
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

  select ct.id,ct.version,ct.status,ct.provider,ct.provider_template_id,ct.metadata
  into v_template
  from public.contract_templates ct
  where ct.tenant_id=v_operation.tenant_id
    and ct.template_key=v_template_key
  order by case when ct.version='V3.1' then 0 else 1 end,ct.created_at desc
  limit 1;

  if v_template.id is null then
    return jsonb_build_object(
      'ready',false,
      'status','blocked',
      'mode','missing',
      'detail','contract_template_missing'
    );
  end if;

  v_mode := nullif(btrim(coalesce(v_template.metadata->>'provider_document_mode','')),'');
  v_renderer_version := nullif(btrim(coalesce(v_template.metadata->>'document_renderer_version','')),'');
  v_provider_template_id := nullif(btrim(coalesce(v_template.provider_template_id,'')),'');

  if v_mode='upload' then
    v_ready := v_renderer_version is not null;
  elsif v_mode='provider_template' then
    v_ready := v_provider_template_id is not null;
  else
    v_ready := false;
  end if;

  return jsonb_build_object(
    'ready',v_ready,
    'status',case when v_ready then 'ready' else 'blocked' end,
    'mode',coalesce(v_mode,'missing'),
    'template_version',v_template.version,
    'renderer_version',v_renderer_version,
    'provider_template_configured',v_provider_template_id is not null,
    'detail',case
      when v_mode='upload' and v_renderer_version is null then 'upload_renderer_not_registered'
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

comment on function public.get_contract_document_pipeline_readiness(uuid,text) is
  'Read-only contract document pipeline diagnostic. Upload mode is ready only when a versioned renderer is explicitly registered in template metadata.';
