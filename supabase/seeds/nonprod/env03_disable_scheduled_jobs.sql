-- ENV-03 non-production scheduler guard.
-- Remote workers remain disabled until separately authorized and configured.

BEGIN;

DO $guard$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END
$guard$;

COMMIT;
