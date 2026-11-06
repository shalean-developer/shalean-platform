-- Issue #1076 native permissions regression.
-- DISPOSABLE PostgreSQL 17 database ONLY.
BEGIN;

DO $$
DECLARE
  v_function regprocedure :=
    'public.marketing_record_consent_decision_atomic(uuid,text,text,text,text,text,boolean,integer)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute atomic consent function';
  END IF;

  IF has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute atomic consent function';
  END IF;

  IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lacks atomic consent permission';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = v_function
      AND prosecdef
      AND proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'SECURITY DEFINER or search_path restriction missing';
  END IF;
END;
$$;

-- Verify execution is actually denied, even with a spoofed claim.
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SET LOCAL ROLE anon;

DO $$
DECLARE
  v_error text;
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM *
    FROM public.marketing_record_consent_decision_atomic(
      '00000000-0000-4000-8000-000000001079',
      'permission-1079@example.test',
      'withdrawn',
      'signed_one_click',
      'marketing-email-2026-11-v1',
      'synthetic-permission-test',
      false, 0
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;

      IF v_error LIKE
          'permission denied for function marketing_record_consent_decision_atomic%'
      THEN
        v_denied := true;
      ELSE
        RAISE EXCEPTION
          'Unexpected permission error: %', v_error;
      END IF;
  END;

  IF NOT v_denied THEN
    RAISE EXCEPTION
      'SECURITY TEST FAILED: anon RPC execution was not denied';
  END IF;
END;
$$;
RESET ROLE;
ROLLBACK;

SELECT 'PASS: atomic function permissions' AS result;
