-- COBS OS · Production scheduler isolation v1
--
-- Runs only on the new production bootstrap marker. It removes inherited QA-only
-- schedulers and rewrites the payment reconciliation scheduler to the PROD Edge
-- Function URL. Reconciliation remains INACTIVE until production secrets and the
-- controlled live-payment gate are explicitly completed.

DO $$
DECLARE
  _job_id bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.operations o
    WHERE o.code = 'CIOSP-SP-2027'
      AND o.archived_at IS NULL
      AND coalesce((o.metadata->>'production_bootstrap')::boolean, false) = true
  ) THEN
    RETURN;
  END IF;

  -- Payment reconciliation: correct PROD target, but remain disabled.
  SELECT jobid INTO _job_id
  FROM cron.job
  WHERE jobname = 'cobs-payments-reconcile-pending'
  ORDER BY jobid
  LIMIT 1;

  IF _job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      _job_id,
      command := $cmd$
        select net.http_post(
          url := 'https://axsqxuvaxyiflpnnifki.supabase.co/functions/v1/payments-reconcile-pending',
          body := '{"limit":25}'::jsonb,
          params := '{}'::jsonb,
          headers := jsonb_build_object(
            'content-type','application/json',
            'x-cobs-reconcile-token',(
              select decrypted_secret
              from vault.decrypted_secrets
              where name='cobs_payment_reconcile_token'
              limit 1
            )
          ),
          timeout_milliseconds := 20000
        );
      $cmd$,
      active := false
    );
  END IF;

  -- Dispatcher is not part of the current production P0 function set yet.
  -- Remove the inherited QA-targeting schedule; it will be recreated explicitly
  -- when the production dispatcher/secrets are validated.
  FOR _job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'cobs-order-confirmed-automation-dispatch'
       OR jobname = 'cobs-participant-added-qa-tick'
  LOOP
    PERFORM cron.unschedule(_job_id);
  END LOOP;

  -- Postconditions: no QA project reference or QA-named scheduler may remain.
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE lower(coalesce(command,'')) LIKE '%nktohbqmcpgonlizzcka%'
       OR lower(coalesce(jobname,'')) LIKE '%qa%'
  ) THEN
    RAISE EXCEPTION 'Production scheduler isolation failed: QA scheduler residue remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'cobs-payments-reconcile-pending'
      AND (
        active = true
        OR command NOT LIKE '%axsqxuvaxyiflpnnifki.supabase.co/functions/v1/payments-reconcile-pending%'
      )
  ) THEN
    RAISE EXCEPTION 'Production scheduler isolation failed: reconciliation scheduler is not safely configured';
  END IF;
END
$$;
