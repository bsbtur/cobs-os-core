create or replace function app_private.assistant_localize_trusted_context(_ctx jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog','public'
as $function$
declare
  _out jsonb := coalesce(_ctx,'{}'::jsonb);
  _timezone text := coalesce(nullif(_ctx#>>'{operation,timezone}',''),'UTC');
  _known jsonb := '[]'::jsonb;
  _fact jsonb;
begin
  _out := jsonb_set(_out,'{operation}',app_private.assistant_localize_time_fields(coalesce(_out->'operation','{}'::jsonb),_timezone),true);
  _out := jsonb_set(_out,'{schedule,journey}',app_private.assistant_localize_time_array(_out#>'{schedule,journey}',_timezone),true);
  _out := jsonb_set(_out,'{schedule,transport}',app_private.assistant_localize_time_array(_out#>'{schedule,transport}',_timezone),true);
  _out := jsonb_set(_out,'{schedule,events}',app_private.assistant_localize_time_array(_out#>'{schedule,events}',_timezone),true);
  _out := jsonb_set(_out,'{hospitality}',app_private.assistant_localize_time_array(_out->'hospitality',_timezone),true);

  for _fact in select value from jsonb_array_elements(coalesce(_out->'known_facts','[]'::jsonb)) loop
    if _fact->>'fact' in ('operation_planned_start','operation_planned_end','operation_expected_start','operation_expected_end')
      and nullif(_fact->>'value','') is not null then
      begin
        _fact := jsonb_set(
          _fact,
          '{value}',
          to_jsonb(to_char((_fact->>'value')::timestamptz at time zone _timezone,'YYYY-MM-DD HH24:MI:SS') || ' ' || _timezone),
          true
        );
      exception when others then null;
      end;
    end if;
    _known := _known || jsonb_build_array(_fact);
  end loop;

  _out := jsonb_set(_out,'{known_facts}',_known,true);
  _out := jsonb_set(
    _out,
    '{time_semantics}',
    jsonb_build_object(
      'all_datetime_values','operation_local_time',
      'timezone',_timezone,
      'instruction','Interpret all datetime values as local wall-clock time in the named operation timezone; do not reinterpret them as UTC.'
    ),
    true
  );
  _out := jsonb_set(
    _out,
    '{response_guidance}',
    jsonb_build_object(
      'scope','Answer only the question asked. Do not append later itinerary stages unless they are necessary to answer it or the traveler asks what happens next.',
      'pending','When a requested time, venue or address is not confirmed, say plainly that it is still to be confirmed.',
      'traveler_language','Use natural traveler-facing language. Do not refer to context, payload, fields, internal status or implementation details.'
    ),
    true
  );
  return _out;
end;
$function$;