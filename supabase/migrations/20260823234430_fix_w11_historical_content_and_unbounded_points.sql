-- COBS OS W11: allow historical/interpretive content without false PII matches
-- and remove the arbitrary visit-point sequence ceiling.

create or replace function app_private.assert_visit_point_interpretation(_value text)
returns void
language plpgsql
immutable
set search_path = 'pg_catalog','public'
as $$
begin
  if _value is null then
    return;
  end if;

  if length(_value) > 4000 then
    raise exception 'Interpretive content is limited to 4000 characters';
  end if;

  -- Unlike generic operational notes, interpretive content legitimately contains
  -- many historical dates and quantities. Never concatenate all digits before
  -- checking: doing that turns e.g. 1956 + 1961 + 1960 into a fake document ID.
  -- Still reject actual long uninterrupted identifiers and common CPF formatting.
  if _value ~ '[0-9]{9,}'
     or _value ~ '[0-9]{3}[.]?[0-9]{3}[.]?[0-9]{3}-?[0-9]{2}' then
    raise exception 'Interpretive content cannot store document, financial or identification numbers';
  end if;

  if _value ~* '(cpf|rg\M|cnh\M|passaporte|passport|cart[aã]o de cr[eé]dito|credit card|iban|token|senha|password|api[_ -]?key)' then
    raise exception 'Interpretive content cannot store sensitive personal, financial or credential data';
  end if;

  if _value ~* '(al[eé]rgi|alergia|intoler[aâ]nci|medicament|medica[cç][aã]o|rem[eé]dio|insulin|diabet|epilep|asma\M|hipertens|press[aã]o alta|gest(ante|a[cç][aã]o)|gr[aá]vid|tipo sangu[ií]neo|sangue\M|sa[uú]de\M|health|allerg|medication|medicine|disease|doen[cç]a|diagn[oó]stic|laudo|receita m[eé]dica|plano de sa[uú]de|conv[eê]nio m[eé]dico|deficien|cadeirante|psiqui[aá]tric|depress[aã]o|ansiedade)' then
    raise exception 'Interpretive content cannot store sensitive medical data';
  end if;
end;
$$;

revoke all on function app_private.assert_visit_point_interpretation(text) from public, anon;

create or replace function public.create_journey_visit_point(
  _journey_step_id uuid,
  _title text,
  _interpretation text default null,
  _guide_tip text default null)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $$
declare
  _step public.journey_steps;
  _op public.operations;
  _row public.journey_visit_points;
  _seq integer;
  _title_clean text := nullif(btrim(coalesce(_title, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _title_clean is null then
    raise exception 'Visit point title is required';
  end if;

  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations where id = _step.operation_id;
  if _op.status not in ('draft','planning') then
    raise exception 'Visit points can only be created while the operation is in draft or planning';
  end if;

  perform app_private.assert_visit_point_interpretation(nullif(btrim(coalesce(_interpretation, '')), ''));
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_guide_tip, '')), ''));

  -- Serialize sequence allocation per journey step so rapid/concurrent adds cannot
  -- collide. There is intentionally no product-level maximum number of points.
  perform pg_advisory_xact_lock(hashtextextended(_step.id::text, 0));
  select coalesce(max(v.sequence), 0) + 10
    into _seq
    from public.journey_visit_points v
    where v.journey_step_id = _step.id
      and not coalesce((v.metadata ->> 'archived')::boolean, false);

  if _seq is null or _seq <= 0 then
    raise exception 'Unable to allocate visit point sequence';
  end if;

  insert into public.journey_visit_points (
    tenant_id, operation_id, journey_step_id, sequence, title, interpretation, guide_tip, created_by
  ) values (
    _step.tenant_id, _step.operation_id, _step.id, _seq, _title_clean,
    nullif(btrim(coalesce(_interpretation, '')), ''),
    nullif(btrim(coalesce(_guide_tip, '')), ''), auth.uid()
  ) returning * into _row;

  perform app_private.record_audit_event(
    _step.tenant_id, auth.uid(), 'journey.visit_point_created', 'journey_visit_point', _row.id, null,
    jsonb_build_object('operation_id', _step.operation_id, 'journey_step_id', _step.id, 'sequence', _row.sequence, 'title', _row.title)
  );

  return jsonb_build_object('visit_point_id', _row.id, 'journey_step_id', _row.journey_step_id, 'sequence', _row.sequence);
end;
$$;

create or replace function public.update_visit_point(
  _visit_point_id uuid,
  _title text default null,
  _interpretive_content text default null,
  _operational_note text default null,
  _estimated_minutes integer default null,
  _is_required boolean default null,
  _clear_estimated_minutes boolean default false,
  _clear_interpretive_content boolean default false,
  _clear_operational_note boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $$
declare
  _point public.journey_visit_points;
  _step public.journey_steps;
  _op public.operations;
  _title_clean text;
  _interpretation text;
  _guide_tip text;
  _metadata jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into _point from public.journey_visit_points where id = _visit_point_id;
  if _point.id is null then raise exception 'Visit point not found'; end if;
  if coalesce((_point.metadata ->> 'archived')::boolean, false) then
    raise exception 'Archived visit points cannot be edited';
  end if;

  _step := app_private.w04_step(_point.journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations where id = _step.operation_id;
  if _op.status not in ('draft','planning') then
    raise exception 'Visit points can only be edited while the operation is in draft or planning';
  end if;

  _title_clean := case when _title is null then _point.title else nullif(btrim(_title),'') end;
  if _title_clean is null then raise exception 'Visit point title is required'; end if;

  _interpretation := case
    when coalesce(_clear_interpretive_content,false) then null
    when _interpretive_content is null then _point.interpretation
    else nullif(btrim(_interpretive_content),'') end;
  _guide_tip := case
    when coalesce(_clear_operational_note,false) then null
    when _operational_note is null then _point.guide_tip
    else nullif(btrim(_operational_note),'') end;

  perform app_private.assert_visit_point_interpretation(_interpretation);
  perform app_private.assert_generic_note(_guide_tip);

  _metadata := coalesce(_point.metadata,'{}'::jsonb);
  if coalesce(_clear_estimated_minutes,false) then
    _metadata := _metadata - 'estimated_minutes';
  elsif _estimated_minutes is not null then
    if _estimated_minutes <= 0 or _estimated_minutes > 1440 then
      raise exception 'Estimated minutes must be between 1 and 1440';
    end if;
    _metadata := jsonb_set(_metadata, '{estimated_minutes}', to_jsonb(_estimated_minutes), true);
  end if;
  if _is_required is not null then
    _metadata := jsonb_set(_metadata, '{is_required}', to_jsonb(_is_required), true);
  end if;

  update public.journey_visit_points
     set title = _title_clean,
         interpretation = _interpretation,
         guide_tip = _guide_tip,
         metadata = _metadata,
         updated_at = now()
   where id = _point.id
   returning * into _point;

  perform app_private.record_audit_event(
    _point.tenant_id, auth.uid(), 'journey.visit_point_updated', 'journey_visit_point', _point.id, null,
    jsonb_build_object('operation_id', _point.operation_id, 'journey_step_id', _point.journey_step_id, 'title', _point.title)
  );

  return jsonb_build_object('visit_point_id', _point.id, 'sequence', _point.sequence);
end;
$$;

revoke all on function public.create_journey_visit_point(uuid,text,text,text) from public, anon;
grant execute on function public.create_journey_visit_point(uuid,text,text,text) to authenticated, service_role;
revoke all on function public.update_visit_point(uuid,text,text,text,integer,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.update_visit_point(uuid,text,text,text,integer,boolean,boolean,boolean,boolean) to authenticated, service_role;