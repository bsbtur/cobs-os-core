CREATE OR REPLACE FUNCTION app_private.w09_reservation_ttl(_tenant_id uuid)
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  select interval '30 minutes'
$function$;