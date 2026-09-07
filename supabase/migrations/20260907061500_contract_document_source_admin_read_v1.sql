-- COBS OS · Contract document source admin read v1
-- Read-only projection for the exact contract template source state.
-- It never exposes the frozen document body and never mutates legal/provider state.

create or replace function public.get_contract_document_source_for_admin(
  _template_key text,
  _version text
) returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(_template_key,'')),'');
  v_version text := nullif(btrim(coalesce(_version,'')),'');
  v_template record;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_key is null then raise exception 'template_key_required'; end if;
  if v_version is null then raise exception 'template_version_required'; end if;

  select ct.id,ct.tenant_id,ct.template_key,ct.version,ct.name,ct.status,ct.legal_reviewed_at,
         ct.document_source_snapshot,ct.document_source_hash,ct.document_renderer_version,ct.metadata
  into v_template
  from public.contract_templates ct
  where ct.template_key=v_key and ct.version=v_version
    and app_private.has_tenant_role(
      ct.tenant_id,
      array['owner','admin']::public.app_role[]
    )
  order by ct.created_at desc
  limit 1;

  if v_template.id is null then raise exception 'contract_template_not_found'; end if;

  return jsonb_build_object(
    'template_id',v_template.id,
    'template_key',v_template.template_key,
    'template_version',v_template.version,
    'name',v_template.name,
    'status',v_template.status,
    'legal_reviewed_at',v_template.legal_reviewed_at,
    'document_source_registered',v_template.document_source_snapshot is not null,
    'document_source_hash',v_template.document_source_hash,
    'document_renderer_version',v_template.document_renderer_version,
    'provider_document_mode',v_template.metadata->>'provider_document_mode',
    'can_register_source',v_template.status in ('draft','review_required') and v_template.legal_reviewed_at is null
  );
end;
$$;

revoke all on function public.get_contract_document_source_for_admin(text,text) from public,anon;
grant execute on function public.get_contract_document_source_for_admin(text,text) to authenticated,service_role;

comment on function public.get_contract_document_source_for_admin(text,text) is
  'Owner/admin read-only projection of contract document-source metadata. The frozen legal body is intentionally excluded.';
