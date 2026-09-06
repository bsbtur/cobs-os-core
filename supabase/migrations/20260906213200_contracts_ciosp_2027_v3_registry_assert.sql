-- Verify the V3 registry definition without activating it.
do $$
declare r record;
begin
  for r in
    select variable_schema, metadata, status, provider_template_id
    from public.contract_templates
    where template_key='CIOSP-2027' and version='V3'
  loop
    if r.status <> 'review_required' then raise exception 'CIOSP-2027/V3 must start review_required'; end if;
    if r.provider_template_id is not null then raise exception 'CIOSP-2027/V3 must not require a provider template at registration'; end if;
    if r.metadata->>'provider_document_mode' <> 'upload' then raise exception 'CIOSP-2027/V3 must use provider upload mode'; end if;
    if not ((r.variable_schema->'required') ?& array['grand_total_formatted','grand_total_in_words','payment_plan_display','offer_snapshot']) then
      raise exception 'CIOSP-2027/V3 required variables are incomplete';
    end if;
  end loop;
end $$;
