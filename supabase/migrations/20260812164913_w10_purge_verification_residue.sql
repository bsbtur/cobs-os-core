DO $maint$
DECLARE tbls text;
BEGIN
  SELECT string_agg(format('public.%I', c.relname), ', ')
  INTO tbls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  IF tbls IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tbls || ' CASCADE';
  END IF;

  DELETE FROM auth.users;
END
$maint$;
