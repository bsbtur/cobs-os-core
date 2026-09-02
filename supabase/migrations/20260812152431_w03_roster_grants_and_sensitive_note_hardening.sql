-- W03 hardening: least-privilege grants on roster tables
revoke all on public.operation_participations from anon, authenticated;
revoke all on public.operation_role_assignments from anon, authenticated;
revoke all on public.operation_role_types from anon, authenticated;

grant select on public.operation_participations to authenticated;
grant select on public.operation_role_assignments to authenticated;
grant select on public.operation_role_types to authenticated;

grant all on public.operation_participations to service_role;
grant all on public.operation_role_assignments to service_role;
grant all on public.operation_role_types to service_role;

-- W03 hardening: broaden the sensitive-data guard for free-text notes
create or replace function app_private.assert_generic_note(_value text)
returns void
language plpgsql
immutable
set search_path to 'pg_catalog', 'public'
as $$
begin
  if _value is null then
    return;
  end if;
  if length(_value) > 500 then
    raise exception 'Free-text notes are limited to 500 characters';
  end if;
  -- Generic notes are NOT storage for identity documents, health data,
  -- financial data or credentials. Reject the obvious carriers.
  if regexp_replace(_value, '\D', '', 'g') ~ '\d{9,}' then
    raise exception 'Free-text notes cannot store document, financial or identification numbers';
  end if;
  if _value ~* '(cpf|rg\M|cnh\M|passaporte|passport|cart[aã]o de cr[eé]dito|credit card|iban|token|senha|password|api[_ -]?key)' then
    raise exception 'Free-text notes cannot store sensitive personal, medical, financial or credential data';
  end if;
  if _value ~* '(al[eé]rgi|alergia|intoler[aâ]nci|medicament|medica[cç][aã]o|rem[eé]dio|insulin|diabet|epilep|asma\M|hipertens|press[aã]o alta|gest(ante|a[cç][aã]o)|gr[aá]vid|tipo sangu[ií]neo|sangue\M|sa[uú]de\M|health|allerg|medication|medicine|disease|doen[cç]a|diagn[oó]stic|laudo|receita m[eé]dica|plano de sa[uú]de|conv[eê]nio m[eé]dico|deficien|cadeirante|psiqui[aá]tric|depress[aã]o|ansiedade)' then
    raise exception 'Free-text notes cannot store sensitive personal, medical, financial or credential data';
  end if;
end;
$$;

revoke all on function app_private.assert_generic_note(text) from public, anon;