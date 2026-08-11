DO $$
DECLARE
  _qa uuid[] := array(select id from public.tenants where slug in ('qam31-alpha','qam31-bravo'));
  _t text; _pass int; _remaining int;
BEGIN
  IF array_length(_qa,1) IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.w04_control','on', true);
  PERFORM set_config('app.w03_control','on', true);

  FOR _t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind='r'
  LOOP EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', _t); END LOOP;

  FOR _pass IN 1..15 LOOP
    FOR _t IN
      SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped
       WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> 'tenants'
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = ANY($1)', _t) USING _qa;
      EXCEPTION WHEN foreign_key_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;

  SELECT count(*) INTO _remaining FROM (
    SELECT 1 FROM public.operation_participations WHERE tenant_id = ANY(_qa)
    UNION ALL SELECT 1 FROM public.participant_presence_events WHERE tenant_id = ANY(_qa)
    UNION ALL SELECT 1 FROM public.people WHERE tenant_id = ANY(_qa)
    UNION ALL SELECT 1 FROM public.operations WHERE tenant_id = ANY(_qa)
  ) x;
  IF _remaining > 0 THEN RAISE EXCEPTION 'QA cleanup incomplete: % rows remain', _remaining; END IF;

  DELETE FROM public.tenants WHERE id = ANY(_qa);
  DELETE FROM public.profiles p WHERE p.id IN (SELECT u.id FROM auth.users u WHERE u.email LIKE 'qam31.%@cobsqa.test');
  DELETE FROM auth.users WHERE email LIKE 'qam31.%@cobsqa.test';

  FOR _t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind='r'
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', _t); END LOOP;
END $$;