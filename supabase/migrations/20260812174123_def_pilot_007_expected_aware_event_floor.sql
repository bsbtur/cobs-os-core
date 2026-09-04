CREATE OR REPLACE FUNCTION app_private.w04_assert_occurred_at(_op operations, _occurred_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _at timestamptz := coalesce(_occurred_at, now());
  _floor timestamptz;
begin
  if _at > now() + interval '5 minutes' then
    raise exception 'An event cannot be recorded in the future';
  end if;

  -- DEF-PILOT-007: the anti-backdating floor is EXPECTED-aware. The frozen PLANNED
  -- baseline is never modified; when an operation is legitimately anticipated via the
  -- forecast window, runtime facts must be admissible around that earlier window.
  -- least() guarantees a later forecast can never loosen the original planned floor.
  _floor := least(_op.planned_start, coalesce(_op.expected_start, _op.planned_start))
            - interval '24 hours';

  if _at < _floor then
    raise exception 'An event cannot be backdated before the operation window';
  end if;
  return _at;
end;
$function$;