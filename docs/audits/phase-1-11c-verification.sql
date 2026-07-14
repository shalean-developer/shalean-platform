-- Phase 1.11C verification SQL (local replay — READ ONLY assertions)
-- Expect after migrations 20260714130000..20260714130200.
-- Single statement so `npx supabase db query --local -f …` works.
-- Any failure RAISE EXCEPTION (non-zero exit).
--
-- Privilege contract (both sides must hold):
--   A) Service-only tables: zero privileges for anon / authenticated / PUBLIC;
--      service_role retains DML. List MUST match …130000 service_only array.
--   B) Dangerous privileges stripped for all public tables (…130100).
--   C) Customer / marketing / cleaner UX tables retain intentional DML (…130100
--      intentionally did NOT revoke SELECT/INSERT/UPDATE/DELETE). RLS remains
--      the row-level gate (DEBT-DB-013 tracks further verb narrowing).
--   D) Default privileges no longer amplify to anon/authenticated (…130200).

DO $$
DECLARE
  bad text;
  t text;
  missing text;
  danger text;
  retained_miss text;
  fn_oid oid;
  fn_name text;
  fn_args text;
  expected_count integer;
  found_count integer;
  priv text;
  role_name text;
  service_need text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  -- Forbidden for client roles on *all* public tables after …130100.
  danger_privs text[] := ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
  -- Full list from 20260714130000_phase_111c_revoke_service_role_only_table_grants.sql.
  -- Every entry is REQUIRED in the current schema — absence fails verification (M02).
  -- Stricter than retained client tables: NO SELECT/INSERT/UPDATE/DELETE for
  -- anon, authenticated, or PUBLIC (service_role / admin-only workflows).
  service_only text[] := ARRAY[
    'admin_api_idempotency',
    'admin_billing_idempotency',
    'admin_booking_create_idempotency',
    'admin_earnings_actions',
    'admin_money_action_proposals',
    'admin_request_dedupe',
    'accounting_invoice_sync',
    'accounting_sync_records',
    'ai_decision_logs',
    'ai_experiment_exposures',
    'ai_feature_store',
    'ai_model_weights',
    'system_logs',
    'system_metrics',
    'cron_http_targets',
    'cron_run_leases',
    'cron_runs',
    'whatsapp_queue',
    'whatsapp_logs',
    'whatsapp_delivery_events',
    'whatsapp_inbound_feedback_dedupe',
    'whatsapp_cleaner_unmatched_intent_log',
    'notification_logs',
    'notification_alerts',
    'notification_idempotency_claims',
    'notification_runtime_flags',
    'payout_audit_events',
    'payout_transfer_outbox',
    'payout_transfers',
    'earnings_disbursement_transfers',
    'cleaner_payout_runs',
    'failed_jobs',
    'conversion_deferred_payment_link_emails',
    'conversion_experiment_results',
    'conversion_experiments',
    'dispatch_logs',
    'dispatch_metrics',
    'dispatch_retry_queue',
    'dispatch_offer_exposure_dedupe',
    'dispatch_offer_timeout_metric_emitted',
    'dispatch_experiment_snapshots',
    'booking_changes',
    'booking_demand_events',
    'booking_events',
    'booking_lifecycle_jobs',
    'booking_payment_recovery_jobs',
    'booking_roster_member_payouts',
    'booking_service_checklists',
    'booking_service_photos',
    'booking_team_assignments',
    'team_job_member_payouts',
    'team_daily_capacity_usage',
    'cleaner_applications',
    'cleaner_job_issue_reports',
    'cleaner_job_issue_report_idempotency',
    'cleaner_job_lifecycle_idempotency',
    'business_health_scores',
    'expense_accounts',
    'expense_approval_events',
    'expense_approval_limits',
    'expense_categories',
    'expense_vendors',
    'expenses',
    'recurring_expenses',
    'finance_budget_lines',
    'finance_budgets',
    'finance_chart_of_accounts',
    'finance_notifications',
    'payment_transactions',
    'zoho_integration_settings',
    'email_campaigns',
    'email_campaign_sends',
    'growth_action_outcomes',
    'growth_customer_touch',
    'lifecycle_email_metrics',
    'lifecycle_email_settings',
    'marketing_automation_rules',
    'marketing_spend',
    'newsletter_subscribers',
    'campaign_assets',
    'campaign_content',
    'campaign_templates',
    'pricing_booking_config',
    'pricing_catalog_audit',
    'pricing_changes',
    'pricing_metrics',
    'pricing_rules',
    'pricing_slot_adjustments',
    'pricing_versions',
    'promotion_audit_log',
    'promotion_events',
    'service_earning_caps',
    'location_gsc_metrics',
    'location_gsc_queries',
    'location_gsc_sync_meta',
    'seo_auto_hub_ui_patch',
    'seo_auto_title_variant',
    'seo_insights_recommendations',
    'social_accounts',
    'social_publish_history',
    'customer_contact_health',
    'customer_segment',
    'city_configs',
    'cities',
    'monthly_invoice_events',
    'monthly_invoice_paystack_charge_dedup',
    'sales_document_paystack_charge_dedup',
    'payment_link_delivery_events',
    'referral_program_settings',
    'referral_submissions',
    'review_sms_prompt_queue',
    'subscriptions',
    'templates',
    'travel_route_cache',
    'user_behavior',
    'user_events',
    'cleaning_credit_transactions',
    'data_retention_settings'
  ];
  -- Customer/cleaner tables: retain DML for browser hooks; strip only dangerous privs.
  -- Not in service_only revoke list. RLS remains the authorization boundary.
  protected_finance text[] := ARRAY[
    'monthly_invoices',
    'cleaner_earnings',
    'cleaner_payment_details',
    'cleaner_payouts'
  ];
BEGIN
  expected_count := cardinality(service_only);

  -- -------------------------------------------------------------------------
  -- 1) Service-only tables: must exist; zero anon/authenticated/PUBLIC privs;
  --    service_role DML retained (M01 + M02).
  -- -------------------------------------------------------------------------
  FOREACH t IN ARRAY service_only
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION
        'phase_111c FAIL: required service-only table missing: public.%', t;
    END IF;
  END LOOP;

  SELECT string_agg(
    format('%s/%s=%s', table_name, grantee, privilege_type),
    ', ' ORDER BY table_name, grantee, privilege_type
  )
  INTO bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = ANY (service_only)
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'phase_111c FAIL: anon/authenticated/PUBLIC still hold privileges on service-only tables: %',
      bad;
  END IF;

  missing := NULL;
  FOREACH t IN ARRAY service_only
  LOOP
    FOREACH priv IN ARRAY service_need
    LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', t), priv) THEN
        missing := coalesce(missing || ', ', '') || format('%s.%s', t, priv);
      END IF;
    END LOOP;
  END LOOP;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'phase_111c FAIL: service_role missing required DML on service-only tables: %',
      missing;
  END IF;

  -- Guard incompleteness: expected list must be non-empty and fully present.
  IF expected_count < 90 THEN
    RAISE EXCEPTION
      'phase_111c FAIL: service_only verification list too short (%); expected full …130000 set',
      expected_count;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2) No dangerous privileges for client roles on any public table (…130100)
  -- -------------------------------------------------------------------------
  SELECT string_agg(
    format('%s/%s=%s', table_name, grantee, privilege_type),
    ', ' ORDER BY table_name, grantee, privilege_type
  )
  INTO bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND privilege_type = ANY (danger_privs);

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'phase_111c FAIL: client/PUBLIC roles retain dangerous privileges: %', bad;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3) Protected finance tables: must exist; no dangerous privs; service_role DML
  --    (authenticated SELECT/DML may remain by design for RLS customer/cleaner UX)
  -- -------------------------------------------------------------------------
  FOREACH t IN ARRAY protected_finance
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'phase_111c FAIL: protected finance table missing: public.%', t;
    END IF;
  END LOOP;

  IF to_regclass('public.bookings') IS NULL THEN
    RAISE EXCEPTION 'phase_111c FAIL: required table missing: public.bookings';
  END IF;

  SELECT string_agg(
    format('%s/%s=%s', table_name, grantee, privilege_type),
    ', ' ORDER BY table_name, grantee, privilege_type
  )
  INTO danger
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = ANY (protected_finance || ARRAY['bookings'])
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND privilege_type = ANY (danger_privs);

  IF danger IS NOT NULL THEN
    RAISE EXCEPTION
      'phase_111c FAIL: protected tables still grant dangerous client/PUBLIC privs: %',
      danger;
  END IF;

  missing := NULL;
  FOREACH t IN ARRAY ARRAY[
    'bookings',
    'monthly_invoices',
    'cleaner_earnings',
    'cleaner_payment_details',
    'cleaner_payouts'
  ]
  LOOP
    FOREACH priv IN ARRAY service_need
    LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', t), priv) THEN
        missing := coalesce(missing || ', ', '') || format('%s.%s', t, priv);
      END IF;
    END LOOP;
  END LOOP;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'phase_111c FAIL: service_role missing required DML on bookings/finance tables: %',
      missing;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3b) Positive retained client DML (M03) — fail if over-revoked.
  --     Workflow comments document *why* grants remain; RLS still authorizes rows.
  -- -------------------------------------------------------------------------
  retained_miss := NULL;

  -- bookings: authenticated account hooks / realtime (useBookings, Step4Payment).
  -- anon retains historical DML grant set; RLS denies non-owner rows.
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    FOREACH priv IN ARRAY service_need
    LOOP
      IF NOT has_table_privilege(role_name, 'public.bookings', priv) THEN
        retained_miss := coalesce(retained_miss || ', ', '')
          || format('bookings/%s=%s', role_name, priv);
      END IF;
    END LOOP;
  END LOOP;

  -- monthly_invoices: useMonthlyInvoices authenticated SELECT/read workflow.
  IF NOT has_table_privilege('authenticated', 'public.monthly_invoices', 'SELECT') THEN
    retained_miss := coalesce(retained_miss || ', ', '')
      || 'monthly_invoices/authenticated=SELECT';
  END IF;

  -- cleaner_earnings / payment_details / payouts: authenticated cleaner RLS SELECT.
  FOREACH t IN ARRAY ARRAY[
    'cleaner_earnings',
    'cleaner_payment_details',
    'cleaner_payouts'
  ]
  LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', t), 'SELECT') THEN
      retained_miss := coalesce(retained_miss || ', ', '')
        || format('%s/authenticated=SELECT', t);
    END IF;
  END LOOP;

  -- Marketing / catalog: anon RSC getSupabaseServer (home, blog, pricing).
  FOREACH t IN ARRAY ARRAY[
    'blog_posts',
    'locations',
    'services',
    'faqs',
    'pricing_services',
    'pricing_extras'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'phase_111c FAIL: required marketing/catalog table missing: public.%', t;
    END IF;
    IF NOT has_table_privilege('anon', format('public.%I', t), 'SELECT') THEN
      retained_miss := coalesce(retained_miss || ', ', '')
        || format('%s/anon=SELECT', t);
    END IF;
  END LOOP;

  -- Customer account browser surfaces.
  FOREACH t IN ARRAY ARRAY[
    'user_profiles',
    'customer_saved_addresses',
    'user_notifications',
    'sales_documents'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'phase_111c FAIL: required customer table missing: public.%', t;
    END IF;
    IF NOT has_table_privilege('authenticated', format('public.%I', t), 'SELECT') THEN
      retained_miss := coalesce(retained_miss || ', ', '')
        || format('%s/authenticated=SELECT', t);
    END IF;
  END LOOP;

  -- Addresses CRUD + notifications update paths use authenticated DML under RLS.
  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
  LOOP
    IF NOT has_table_privilege('authenticated', 'public.customer_saved_addresses', priv) THEN
      retained_miss := coalesce(retained_miss || ', ', '')
        || format('customer_saved_addresses/authenticated=%s', priv);
    END IF;
  END LOOP;

  IF retained_miss IS NOT NULL THEN
    RAISE EXCEPTION
      'phase_111c FAIL: required retained client privileges missing (over-revoke?): %',
      retained_miss;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4) Sequence bookings_reference_seq
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'bookings_reference_seq'
      AND c.relkind = 'S'
  ) THEN
    RAISE EXCEPTION 'phase_111c FAIL: sequence public.bookings_reference_seq missing';
  END IF;

  IF has_sequence_privilege('anon', 'public.bookings_reference_seq', 'USAGE')
     OR has_sequence_privilege('anon', 'public.bookings_reference_seq', 'SELECT')
     OR has_sequence_privilege('authenticated', 'public.bookings_reference_seq', 'USAGE')
     OR has_sequence_privilege('authenticated', 'public.bookings_reference_seq', 'SELECT')
  THEN
    RAISE EXCEPTION
      'phase_111c FAIL: anon/authenticated still have privileges on bookings_reference_seq';
  END IF;

  IF NOT (
    has_sequence_privilege('service_role', 'public.bookings_reference_seq', 'USAGE')
    AND has_sequence_privilege('service_role', 'public.bookings_reference_seq', 'SELECT')
  ) THEN
    RAISE EXCEPTION
      'phase_111c FAIL: service_role lost privileges on bookings_reference_seq';
  END IF;

  -- -------------------------------------------------------------------------
  -- 5) WhatsApp queue functions — exact identities (L01), not a bare count
  --    Expected (public schema):
  --      get_pending_whatsapp_jobs(limit_count integer, max_delivery_attempts integer)
  --      get_whatsapp_queue_status_metrics()   -- identity args empty
  -- -------------------------------------------------------------------------
  FOR fn_name, fn_args IN
    SELECT *
    FROM (
      VALUES
        (
          'get_pending_whatsapp_jobs',
          'limit_count integer, max_delivery_attempts integer'
        ),
        (
          'get_whatsapp_queue_status_metrics',
          ''
        )
    ) AS expected(proname, identity_args)
  LOOP
    SELECT p.oid
    INTO fn_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = fn_name
      AND pg_get_function_identity_arguments(p.oid) = fn_args;

    IF fn_oid IS NULL THEN
      RAISE EXCEPTION
        'phase_111c FAIL: expected WhatsApp function missing: public.%(%)',
        fn_name,
        fn_args;
    END IF;

    IF has_function_privilege('anon', fn_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', fn_oid, 'EXECUTE')
    THEN
      RAISE EXCEPTION
        'phase_111c FAIL: clients can EXECUTE public.%(%)',
        fn_name,
        fn_args;
    END IF;

    IF NOT has_function_privilege('service_role', fn_oid, 'EXECUTE') THEN
      RAISE EXCEPTION
        'phase_111c FAIL: service_role cannot EXECUTE public.%(%)',
        fn_name,
        fn_args;
    END IF;
  END LOOP;

  -- Reject overload ambiguity / unexpected extras under these names.
  SELECT count(*)
  INTO found_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'get_pending_whatsapp_jobs',
      'get_whatsapp_queue_status_metrics'
    );

  IF found_count <> 2 THEN
    RAISE EXCEPTION
      'phase_111c FAIL: expected exactly 2 WhatsApp queue function signatures in public, found %',
      found_count;
  END IF;

  -- -------------------------------------------------------------------------
  -- 6) Default privileges hardening (…130200)
  -- -------------------------------------------------------------------------
  SELECT string_agg(
    format(
      '%s->%s:%s',
      CASE d.defaclobjtype
        WHEN 'r' THEN 'table'
        WHEN 'S' THEN 'sequence'
        WHEN 'f' THEN 'function'
        ELSE d.defaclobjtype::text
      END,
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
    RAISE EXCEPTION
      'phase_111c FAIL: default privileges still grant to anon/authenticated: %', bad;
  END IF;

  SELECT string_agg(need.privilege_type, ', ' ORDER BY need.privilege_type)
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
    RAISE EXCEPTION
      'phase_111c FAIL: postgres default table privileges missing for service_role: %',
      missing;
  END IF;

  -- -------------------------------------------------------------------------
  -- 7) Schema USAGE retained
  -- -------------------------------------------------------------------------
  IF NOT (
    has_schema_privilege('anon', 'public', 'USAGE')
    AND has_schema_privilege('authenticated', 'public', 'USAGE')
    AND has_schema_privilege('service_role', 'public', 'USAGE')
  ) THEN
    RAISE EXCEPTION
      'phase_111c FAIL: public schema USAGE not retained for anon/authenticated/service_role';
  END IF;

  RAISE NOTICE
    'phase_111c verification PASSED (service_only_tables=%)',
    expected_count;
END $$;
