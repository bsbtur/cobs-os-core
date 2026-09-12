-- COBS OS · Production extension/bootstrap hardening v1
--
-- Fresh production bootstrap safety:
-- 1. removes the temporary `http` extension used only during schema promotion;
-- 2. if pg_net was accidentally installed in `public`, disables copied QA-targeting
--    cron jobs before reinstalling pg_net in the validated `extensions` schema.
--
-- CLEAN BUILD already has pg_net in `extensions`, so its schedulers are not changed.

DO $$
DECLARE
  _pg_net_schema text;
BEGIN
  SELECT n.nspname
    INTO _pg_net_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_net';

  IF _pg_net_schema = 'public' THEN
    IF to_regclass('cron.job') IS NOT NULL THEN
      UPDATE cron.job
         SET active = false
       WHERE active
         AND (
           lower(coalesce(jobname, '')) LIKE '%qa%'
           OR lower(coalesce(command, '')) LIKE '%nktohbqmcpgonlizzcka%'
         );
    END IF;

    DROP EXTENSION pg_net;
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http') THEN
    DROP EXTENSION http;
  END IF;
END
$$;

DO $$
DECLARE
  _pg_net_schema text;
BEGIN
  SELECT n.nspname
    INTO _pg_net_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_net';

  IF _pg_net_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION 'pg_net bootstrap hardening failed: expected extensions schema, got %', _pg_net_schema;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http') THEN
    RAISE EXCEPTION 'http bootstrap hardening failed: temporary extension still installed';
  END IF;
END
$$;
