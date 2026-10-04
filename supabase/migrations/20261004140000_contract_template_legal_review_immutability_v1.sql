-- COBS OS · Contract template legal review immutability v1
-- Freezes formal template review identity once legal review is recorded or template is active.
-- Does not review, activate or modify any contract template row.

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

  if (old.legal_reviewed_at is not null or old.status='active')
     and (
       new.legal_reviewed_at is distinct from old.legal_reviewed_at
       or new.legal_reviewed_by is distinct from old.legal_reviewed_by
     ) then
    raise exception 'reviewed_contract_legal_evidence_immutable';
  end if;

  return new;
end;
$$;

revoke execute on function app_private.guard_contract_template_reviewed_document_immutability()
from public, anon, authenticated, service_role;

drop trigger if exists contract_templates_reviewed_document_immutability on public.contract_templates;
create trigger contract_templates_reviewed_document_immutability
before update of document_source_snapshot,document_source_hash,document_renderer_version,legal_reviewed_at,legal_reviewed_by,status
on public.contract_templates
for each row execute function app_private.guard_contract_template_reviewed_document_immutability();
