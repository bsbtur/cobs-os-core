create or replace function app_private.assistant_destination_direct_answer(_ctx jsonb, _message text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog','public'
as $function$
declare
  _msg text := lower(btrim(coalesce(_message,'')));
  _target text;
  _target_lc text;
  _leg jsonb;
  _journey jsonb;
  _origin text;
  _destination text;
  _date_text text;
  _date_label text;
  _departure text;
begin
  _msg := regexp_replace(_msg, '^[[:space:]“”"''—–-]+', '');
  _msg := regexp_replace(_msg, '[[:space:]“”"''?.!]+$', '');

  _target := substring(_msg from 'como[[:space:]]+(?:eu[[:space:]]+)?(?:volto|vou|retorno)[[:space:]]+para[[:space:]]+(.+)$');
  if _target is null then return null; end if;

  _target := btrim(_target, ' "' || chr(39) || '“”?.!');
  if _target = '' then return null; end if;
  _target_lc := lower(_target);

  select value into _leg
  from jsonb_array_elements(coalesce(_ctx#>'{schedule,transport}','[]'::jsonb))
  where lower(coalesce(value->>'destination','')) = _target_lc
     or lower(coalesce(value->>'destination','')) like _target_lc || ' ·%'
     or lower(coalesce(value->>'destination','')) like _target_lc || ' -%'
  order by coalesce((value->>'sequence')::int,2147483647)
  limit 1;

  if _leg is null then return null; end if;

  _origin := nullif(_leg->>'origin','');
  _destination := nullif(_leg->>'destination','');
  _departure := coalesce(nullif(_leg->>'expected_departure',''),nullif(_leg->>'planned_departure',''));

  select value into _journey
  from jsonb_array_elements(coalesce(_ctx#>'{schedule,journey}','[]'::jsonb))
  where lower(coalesce(value->>'location','')) like '%→ ' || _target_lc
     or lower(coalesce(value->>'location','')) like '%→ ' || _target_lc || ' ·%'
  order by coalesce((value->>'sequence')::int,2147483647)
  limit 1;

  if _journey is not null then
    _date_text := left(coalesce(_journey->>'expected_start',_journey->>'planned_start',''),10);
    if _date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      _date_label := to_char(_date_text::date,'DD/MM/YYYY');
    end if;
  end if;

  if _date_label is not null and _origin is not null then
    if _departure is null then
      return format('Você volta para %s no dia %s, saindo de %s. O horário desse traslado ainda está a confirmar.',initcap(_target),_date_label,_origin);
    end if;
    return format('Você volta para %s no dia %s, saindo de %s.',initcap(_target),_date_label,_origin);
  end if;

  if _origin is not null then
    if _departure is null then
      return format('O roteiro prevê um traslado de %s para %s. O horário ainda está a confirmar.',_origin,coalesce(_destination,initcap(_target)));
    end if;
    return format('O roteiro prevê um traslado de %s para %s.',_origin,coalesce(_destination,initcap(_target)));
  end if;

  return null;
end;
$function$;