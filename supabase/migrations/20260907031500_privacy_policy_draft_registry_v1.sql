-- COBS OS · Privacy policy draft registry v1
-- Creates an immutable, server-hashed draft lifecycle for contractual privacy evidence.
-- Authenticated users can register drafts only; there is deliberately no activation RPC.

alter table public.privacy_policy_versions
  add column if not exists content_snapshot text,
  add column if not exists legal_reviewed_at timestamptz,
  add column if not exists legal_review_reference text;

comment on column public.privacy_policy_versions.content_snapshot is
  'Exact frozen privacy-policy text for this version. New contractual drafts are hashed server-side from this snapshot.';
comment on column public.privacy_policy_versions.legal_reviewed_at is
  'Timestamp reserved for actual formal legal review. Draft registration never sets this field.';
comment on column public.privacy_policy_versions.legal_review_reference is
  'Reference to the formal legal review evidence required before activation.';

create or replace function app_private.guard_privacy_policy_activation_evidence()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if new.status='active' then
    if nullif(btrim(coalesce(new.content_snapshot,'')),'') is null
       or nullif(btrim(coalesce(new.content_hash,'')),'') is null
       or new.legal_reviewed_at is null
       or nullif(btrim(coalesce(new.legal_review_reference,'')),'') is null then
      raise exception 'privacy_policy_formal_legal_review_required';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists privacy_policy_versions_activation_guard on public.privacy_policy_versions;
create trigger privacy_policy_versions_activation_guard
before insert or update of status, content_snapshot, content_hash, legal_reviewed_at, legal_review_reference
on public.privacy_policy_versions
for each row execute function app_private.guard_privacy_policy_activation_evidence();

create or replace function public.register_privacy_policy_draft(
  _tenant_id uuid,
  _policy_key text,
  _version text,
  _title text,
  _effective_at timestamptz,
  _content_snapshot text,
  _public_url text default null,
  _scope text default 'traveler_contract'
) returns jsonb
language plpgsql
security definer
set search_path='public','app_private','extensions','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_policy_key text := nullif(btrim(coalesce(_policy_key,'')),'');
  v_version text := nullif(btrim(coalesce(_version,'')),'');
  v_title text := nullif(btrim(coalesce(_title,'')),'');
  v_content text := nullif(btrim(coalesce(_content_snapshot,'')),'');
  v_public_url text := nullif(btrim(coalesce(_public_url,'')),'');
  v_scope text := nullif(btrim(coalesce(_scope,'')),'');
  v_hash text;
  v_existing public.privacy_policy_versions%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not app_private.has_tenant_role(
    _tenant_id,
    array['owner','admin']::public.app_role[]
  ) then
    raise exception 'forbidden';
  end if;

  if v_policy_key is null or v_version is null or v_title is null
     or _effective_at is null or v_content is null or v_scope is null then
    raise exception 'privacy_policy_draft_fields_required';
  end if;
  if length(v_content) < 80 then
    raise exception 'privacy_policy_content_too_short';
  end if;

  v_hash := encode(digest(convert_to(v_content,'UTF8'),'sha256'),'hex');

  select * into v_existing
  from public.privacy_policy_versions
  where tenant_id=_tenant_id
    and policy_key=v_policy_key
    and version=v_version
  for update;

  if found then
    if v_existing.status <> 'draft' then
      raise exception 'privacy_policy_version_not_draft';
    end if;
    if v_existing.content_hash <> v_hash
       or coalesce(v_existing.content_snapshot,'') <> v_content then
      raise exception 'privacy_policy_version_immutable';
    end if;
    return jsonb_build_object(
      'privacy_policy_version_id',v_existing.id,
      'status',v_existing.status,
      'content_hash',v_existing.content_hash,
      'idempotent',true
    );
  end if;

  insert into public.privacy_policy_versions(
    tenant_id, policy_key, version, title, effective_at,
    content_hash, content_snapshot, public_url, status, metadata
  ) values (
    _tenant_id, v_policy_key, v_version, v_title, _effective_at,
    v_hash, v_content, v_public_url, 'draft', jsonb_build_object(
      'scope',v_scope,
      'hash_algorithm','sha256',
      'activation_guard','formal_legal_validation_required',
      'created_by',v_uid
    )
  ) returning id into v_id;

  perform app_private.record_audit_event(
    _tenant_id,
    v_uid,
    'privacy_policy.draft_registered',
    'privacy_policy_version',
    v_id,
    null,
    jsonb_build_object(
      'policy_key',v_policy_key,
      'version',v_version,
      'scope',v_scope,
      'content_hash',v_hash,
      'status','draft'
    )
  );

  return jsonb_build_object(
    'privacy_policy_version_id',v_id,
    'status','draft',
    'content_hash',v_hash,
    'idempotent',false
  );
end;
$$;

revoke all on function public.register_privacy_policy_draft(uuid,text,text,text,timestamptz,text,text,text) from public,anon;
grant execute on function public.register_privacy_policy_draft(uuid,text,text,text,timestamptz,text,text,text) to authenticated,service_role;

comment on function public.register_privacy_policy_draft(uuid,text,text,text,timestamptz,text,text,text) is
  'Owner/admin-only immutable draft registration. Computes SHA-256 server-side and never activates or marks legal review.';
