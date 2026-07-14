-- Phase 1.11C verification SQL (local replay — READ ONLY assertions)
-- Expect after migrations 20260714130000..20260714130200.
-- Single statement so `npx supabase db query --local -f …` works.
-- Any failure RAISE EXCEPTION (non-zero exit).

DO $$
DECLARE
  bad text;
  t text;
  missing text;
  danger text;
  fn record;
  function_count integer;
  priv text;
  service_need text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  service_only text[] := ARRAY[
    'admin_api_idempotency',
    'admin_billing_idempotency',
    'admin_booking_create_idempotency',
    'admin_earnings_actions',
    'admin_money_action_proposals',
    'admin_request_dedupe',
    'system_logs',
    'cron_http_targets',
    'whatsapp_queue',
    'notification_logs',
    'payout_transfers',
    'failed_jobs',
    'payment_transactions',
    'expenses'
  ];
  protected text[] := ARRAY[
    'monthly_invoices',
    'cleaner_earnings',
    'cleaner_payment_details',
    'cleaner_payouts'
  ];
BEGIN
  -- 1) Service-only tables: zero anon/authenticated privileges; service_role DML retained
  SELECT string_agg(format('%s/%s=%s', table_name, grantee, privilege_type), ', ' ORDER BY 1)
  INTO bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = ANY (service_only)
    AND grantee IN ('anon', 'authenticated');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'phase_111c FAIL: anon/authenticated still hold privileges on service-only tables: %', bad;
  END IF;

  missing := NULL;
  FOREACH t IN ARRAY service_only
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    FOREACH priv IN ARRAY service_need
    LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', t), priv) THEN
        missing := coalesce(missing || ', ', '') || format('%s.%s', t, priv);
      END IF;
    END LOOP;
  END LOOP;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'phase_111c FAIL: service_role missing required DML on service-only tables: %', missing;
  END IF;

  -- 2) No dangerous privileges for client roles on any public table
  SELECT string_agg(format('%s/%s=%s', table_name, grantee, privilege_type), ', ' ORDER BY 1)
  INTO bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'phase_111c FAIL: client roles retain dangerous privileges: %', bad;
  END IF;

  -- 3) Protected finance tables: no catastrophic client privs; service_role DML
  --    (authenticated SELECT/DML may remain by design for RLS customer/cleaner UX)
  SELECT string_agg(format('%s/%s=%s', table_name, grantee, privilege_type), ', ' ORDER BY 1)
  INTO danger
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = ANY (protected)
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');

  IF danger IS NOT NULL THEN
    RAISE EXCEPTION 'phase_111c FAIL: protected tables still grant dangerous client privs: %', danger;
  END IF;

  missing := NULL;
  FOREACH t IN ARRAY protected
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'phase_111c FAIL: protected table missing: %', t;
    END IF;
    FOREACH priv IN ARRAY service_need
    LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', t), priv) THEN
        missing := coalesce(missing || ', ', '') || format('%s.%s', t, priv);
      END IF;
    END LOOP;
  END LOOP;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'phase_111c FAIL: service_role missing required DML on protected tables: %', missing;
  END IF;

  -- 4) Sequence bookings_reference_seq
  IF has_sequence_privilege('anon', 'public.bookings_reference_seq', 'USAGE')
     OR has_sequence_privilege('anon', 'public.bookings_reference_seq', 'SELECT')
     OR has_sequence_privilege('authenticated', 'public.bookings_reference_seq', 'USAGE')
     OR has_sequence_privilege('authenticated', 'public.bookings_reference_seq', 'SELECT')
  THEN
    RAISE EXCEPTION 'phase_111c FAIL: anon/authenticated still have privileges on bookings_reference_seq';
  END IF;

  IF NOT (
    has_sequence_privilege('service_role', 'public.bookings_reference_seq', 'USAGE')
    AND has_sequence_privilege('service_role', 'public.bookings_reference_seq', 'SELECT')
  ) THEN
    RAISE EXCEPTION 'phase_111c FAIL: service_role lost privileges on bookings_reference_seq';
  END IF;

  -- 5) WhatsApp queue functions
  SELECT count(*)
  INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'get_pending_whatsapp_jobs',
      'get_whatsapp_queue_status_metrics'
    );

  IF function_count <> 2 THEN
    RAISE EXCEPTION
      'phase_111c FAIL: expected 2 WhatsApp queue functions, found %',
      function_count;
  END IF;

  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_pending_whatsapp_jobs', 'get_whatsapp_queue_status_metrics')
  LOOP
    IF has_function_privilege('anon', fn.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', fn.oid, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'phase_111c FAIL: clients can EXECUTE %', fn.proname;
    END IF;
    IF NOT has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'phase_111c FAIL: service_role cannot EXECUTE %', fn.proname;
    END IF;
  END LOOP;

  -- 6) Default privileges: postgres / public must not auto-grant to anon/authenticated;
  --    service_role must retain default DML on future tables
  SELECT string_agg(
    format('%s->%s:%s',
      CASE d.defaclobjtype WHEN 'r' THEN 'table' WHEN 'S' THEN 'sequence' WHEN 'f' THEN 'function' ELSE d.defaclobjtype::text END,
      grantee.rolname,
      a.privilege_type
    ),
    ', ' ORDER BY 1
  )
  INTO bad
  FROM pg_default_acl d
  JOIN pg_roles grantor_role ON grantor_role.oid = d.defaclrole
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  JOIN pg_roles grantee ON grantee.oid = a.grantee
  WHERE n.nspname = 'public'
    AND grantor_role.rolname = 'postgres'
    AND grantee.rolname IN ('anon', 'authenticated');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'phase_111c FAIL: default privileges still grant to anon/authenticated: %', bad;
  END IF;

  SELECT string_agg(need.privilege_type, ', ')
  INTO missing
  FROM (
    SELECT unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege_type
  ) need
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles grantor_role ON grantor_role.oid = d.defaclrole
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles grantee ON grantee.oid = a.grantee
    WHERE n.nspname = 'public'
      AND grantor_role.rolname = 'postgres'
      AND d.defaclobjtype = 'r'
      AND grantee.rolname = 'service_role'
      AND a.privilege_type = need.privilege_type
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'phase_111c FAIL: postgres default table privileges missing for service_role: %', missing;
  END IF;

  -- 7) Schema USAGE retained
  IF NOT (
    has_schema_privilege('anon', 'public', 'USAGE')
    AND has_schema_privilege('authenticated', 'public', 'USAGE')
    AND has_schema_privilege('service_role', 'public', 'USAGE')
  ) THEN
    RAISE EXCEPTION 'phase_111c FAIL: public schema USAGE not retained for anon/authenticated/service_role';
  END IF;

  RAISE NOTICE 'phase_111c verification PASSED';
END $$;
