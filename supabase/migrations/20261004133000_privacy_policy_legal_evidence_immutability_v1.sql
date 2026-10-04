-- COBS OS · Privacy policy legal evidence immutability v1
-- Freezes the formal legal-review evidence once review is recorded or policy is active.
-- Does not create, review, activate or modify any privacy-policy row.

create or replace function app_private.guard_privacy_policy_activation_evidence()
returns trigger language plpgsql security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare v_source text; v_expected_hash text;
begin
 if tg_op='UPDATE' and (old.legal_reviewed_at is not null or old.status='active')
 and (
   new.content_snapshot is distinct from old.content_snapshot
   or new.content_hash is distinct from old.content_hash
 )
 then raise exception 'reviewed_privacy_policy_content_immutable'; end if;

 if tg_op='UPDATE' and (old.legal_reviewed_at is not null or old.status='active')
 and (
   new.legal_reviewed_at is distinct from old.legal_reviewed_at
   or new.legal_review_reference is distinct from old.legal_review_reference
 )
 then raise exception 'reviewed_privacy_policy_legal_evidence_immutable'; end if;

 if new.status='active' then
   v_source:=nullif(btrim(coalesce(new.content_snapshot,'')),'');
   if v_source is null or nullif(btrim(coalesce(new.content_hash,'')),'') is null or new.legal_reviewed_at is null
      or nullif(btrim(coalesce(new.legal_review_reference,'')),'') is null
   then raise exception 'privacy_policy_formal_legal_review_required'; end if;
   v_expected_hash:=encode(extensions.digest(convert_to(v_source,'UTF8'),'sha256'),'hex');
   if lower(btrim(new.content_hash))<>v_expected_hash then raise exception 'privacy_policy_content_hash_mismatch'; end if;
 end if;
 return new;
end;$function$;

revoke execute on function app_private.guard_privacy_policy_activation_evidence()
from public, anon, authenticated, service_role;
