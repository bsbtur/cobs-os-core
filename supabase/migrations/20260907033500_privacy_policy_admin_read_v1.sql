-- COBS OS · Privacy policy admin read v1
-- Owner/admin-only read projection for policy metadata.
-- Never exposes the frozen policy body and never mutates policy state.

create or replace function public.get_privacy_policy_versions_for_admin(
  _tenant_id uuid,
  _policy_key text
) returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_policy_key text := nullif(btrim(coalesce(_policy_key,'')),'');
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not app_private.has_tenant_role(
    _tenant_id,
    array['owner','admin']::public.app_role[]
  ) then
    raise exception 'forbidden';
  end if;
  if v_policy_key is null then raise exception 'privacy_policy_key_required'; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'policy_key', p.policy_key,
        'version', p.version,
        'title', p.title,
        'effective_at', p.effective_at,
        'content_hash', p.content_hash,
        'status', p.status,
        'created_at', p.created_at
      ) order by p.created_at desc
    ),
    '[]'::jsonb
  ) into v_rows
  from public.privacy_policy_versions p
  where p.tenant_id=_tenant_id
    and p.policy_key=v_policy_key;

  return v_rows;
end;
$$;

revoke all on function public.get_privacy_policy_versions_for_admin(uuid,text) from public,anon;
grant execute on function public.get_privacy_policy_versions_for_admin(uuid,text) to authenticated,service_role;

comment on function public.get_privacy_policy_versions_for_admin(uuid,text) is
  'Owner/admin-only metadata projection for privacy policy versions. Excludes content_snapshot and performs no mutation.';
