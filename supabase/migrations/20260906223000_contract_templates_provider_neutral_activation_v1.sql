-- COBS OS · Contract template provider-neutral activation hardening
-- Keeps legal review as the activation gate while removing the accidental
-- requirement for a provider template ID. Generated-document/upload flows
-- (for example Clicksign upload mode) do not require provider_template_id.
-- No template is activated by this migration and no provider/customer call occurs.

do $$
declare
  _constraint_name text;
begin
  select c.conname
    into _constraint_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'contract_templates'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%provider_template_id%'
     and pg_get_constraintdef(c.oid) ilike '%status%active%'
   order by c.oid
   limit 1;

  if _constraint_name is not null then
    execute format(
      'alter table public.contract_templates drop constraint %I',
      _constraint_name
    );
  end if;
end $$;

comment on column public.contract_templates.provider_template_id is
  'Optional provider integration metadata. Not required for activation when the provider uses generated-document upload mode.';

comment on table public.contract_templates is
  'Provider-neutral versioned contract template registry. Activation requires formal legal review; provider template IDs are optional integration metadata.';
