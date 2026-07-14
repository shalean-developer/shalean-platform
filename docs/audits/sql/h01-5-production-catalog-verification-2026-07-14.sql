-- =============================================================================
-- READ-ONLY PRODUCTION CATALOG VERIFICATION
-- NO MUTATING SQL IS PERMITTED IN THIS FILE
-- =============================================================================
-- H01.5 — Production catalog and privilege verification
-- Date: 2026-07-14
-- Target: linked Supabase production project (shalean-platform)
--
-- SAFETY RULES:
--   * Every executable statement begins with SELECT or WITH ... SELECT
--   * Do not wrap in DO blocks, CREATE, ALTER, DROP, GRANT, REVOKE, INSERT,
--     UPDATE, DELETE, TRUNCATE, CALL, COPY, MERGE, VACUUM, ANALYZE, etc.
--   * Do not execute SECURITY DEFINER functions
--   * Prefer catalog / information_schema reads only
--
-- Operator execution (read-only, approved linked project only):
--   npx supabase db query --linked -f docs/audits/sql/h01-5-production-catalog-verification-2026-07-14.sql
--   OR run sections one-at-a-time via Management API / MCP execute_sql with SELECT only
--
-- Expected post-governed state is derived from:
--   * 20260714010000_production_baseline.sql
--   * Phase 1.11A–C migrations 20260714120000 .. 20260714130200
--   * docs/audits/phase-1-11a-b-verification.sql
--   * docs/audits/phase-1-11c-verification.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1 — Database identity
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_1_DATABASE_IDENTITY' AS section,
  current_database() AS database,
  current_user AS db_user,
  version() AS server_version,
  now() AS observed_at,
  current_setting('search_path') AS search_path;

-- -----------------------------------------------------------------------------
-- SECTION 2 — Extension inventory (expected from baseline)
-- Expected: pg_cron@pg_catalog, pg_net@public, pg_stat_statements@extensions,
--           pgcrypto@extensions, supabase_vault@vault, uuid-ossp@extensions
-- Plus platform default plpgsql@pg_catalog
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_2_EXTENSIONS' AS section,
  e.extname AS extension,
  n.nspname AS schema,
  CASE e.extname
    WHEN 'pg_cron' THEN 'EXPECTED'
    WHEN 'pg_net' THEN 'EXPECTED'
    WHEN 'pg_stat_statements' THEN 'EXPECTED'
    WHEN 'pgcrypto' THEN 'EXPECTED'
    WHEN 'supabase_vault' THEN 'EXPECTED'
    WHEN 'uuid-ossp' THEN 'EXPECTED'
    WHEN 'plpgsql' THEN 'EXPECTED_PLATFORM'
    ELSE 'UNEXPECTED_OR_REVIEW'
  END AS expectation_class
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY e.extname;

-- -----------------------------------------------------------------------------
-- SECTION 3 — Schema inventory + client schema privileges
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_3_SCHEMAS' AS section,
  n.nspname AS schema_name,
  pg_get_userbyid(n.nspowner) AS owner,
  has_schema_privilege('anon', n.oid, 'USAGE') AS anon_usage,
  has_schema_privilege('anon', n.oid, 'CREATE') AS anon_create,
  has_schema_privilege('authenticated', n.oid, 'USAGE') AS auth_usage,
  has_schema_privilege('authenticated', n.oid, 'CREATE') AS auth_create,
  has_schema_privilege('public', n.oid, 'USAGE') AS public_usage,
  has_schema_privilege('public', n.oid, 'CREATE') AS public_create
FROM pg_namespace n
WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname;

-- -----------------------------------------------------------------------------
-- SECTION 4 — Security-sensitive / Phase 1.11C service-only table inventory
-- -----------------------------------------------------------------------------
WITH expected AS (
  SELECT unnest(ARRAY[
    'admin_api_idempotency','admin_billing_idempotency','admin_booking_create_idempotency',
    'admin_earnings_actions','admin_money_action_proposals','admin_request_dedupe',
    'accounting_invoice_sync','accounting_sync_records',
    'ai_decision_logs','ai_experiment_exposures','ai_feature_store','ai_model_weights',
    'system_logs','system_metrics',
    'cron_http_targets','cron_run_leases','cron_runs',
    'whatsapp_queue','whatsapp_logs','whatsapp_delivery_events',
    'whatsapp_inbound_feedback_dedupe','whatsapp_cleaner_unmatched_intent_log',
    'notification_logs','notification_alerts','notification_idempotency_claims','notification_runtime_flags',
    'payout_audit_events','payout_transfer_outbox','payout_transfers','earnings_disbursement_transfers','cleaner_payout_runs',
    'failed_jobs','conversion_deferred_payment_link_emails','conversion_experiment_results','conversion_experiments',
    'dispatch_logs','dispatch_metrics','dispatch_retry_queue','dispatch_offer_exposure_dedupe',
    'dispatch_offer_timeout_metric_emitted','dispatch_experiment_snapshots',
    'booking_changes','booking_demand_events','booking_events','booking_lifecycle_jobs',
    'booking_payment_recovery_jobs','booking_roster_member_payouts','booking_service_checklists',
    'booking_service_photos','booking_team_assignments','team_job_member_payouts','team_daily_capacity_usage',
    'cleaner_applications','cleaner_job_issue_reports','cleaner_job_issue_report_idempotency','cleaner_job_lifecycle_idempotency',
    'business_health_scores','expense_accounts','expense_approval_events','expense_approval_limits',
    'expense_categories','expense_vendors','expenses','recurring_expenses',
    'finance_budget_lines','finance_budgets','finance_chart_of_accounts','finance_notifications',
    'payment_transactions','zoho_integration_settings',
    'email_campaigns','email_campaign_sends','growth_action_outcomes','growth_customer_touch',
    'lifecycle_email_metrics','lifecycle_email_settings','marketing_automation_rules','marketing_spend',
    'newsletter_subscribers','campaign_assets','campaign_content','campaign_templates',
    'pricing_booking_config','pricing_catalog_audit','pricing_changes','pricing_metrics','pricing_rules',
    'pricing_slot_adjustments','pricing_versions','promotion_audit_log','promotion_events','service_earning_caps',
    'location_gsc_metrics','location_gsc_queries','location_gsc_sync_meta',
    'seo_auto_hub_ui_patch','seo_auto_title_variant','seo_insights_recommendations',
    'social_accounts','social_publish_history',
    'customer_contact_health','customer_segment','city_configs','cities',
    'monthly_invoice_events','monthly_invoice_paystack_charge_dedup','sales_document_paystack_charge_dedup',
    'payment_link_delivery_events','referral_program_settings','referral_submissions','review_sms_prompt_queue',
    'subscriptions','templates','travel_route_cache','user_behavior','user_events',
    'cleaning_credit_transactions','data_retention_settings'
  ]) AS table_name
)
SELECT
  'SECTION_4_SERVICE_ONLY_TABLES' AS section,
  e.table_name,
  (to_regclass(format('public.%I', e.table_name)) IS NOT NULL) AS exists,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN 'MISSING'
    ELSE 'PRESENT'
  END AS existence_class,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE c.relrowsecurity
  END AS rls_enabled,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE c.relforcerowsecurity
  END AS rls_forced,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE has_table_privilege('anon', format('public.%I', e.table_name), 'SELECT')
  END AS anon_select,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE has_table_privilege('anon', format('public.%I', e.table_name), 'INSERT')
  END AS anon_insert,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE has_table_privilege('anon', format('public.%I', e.table_name), 'UPDATE')
  END AS anon_update,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE has_table_privilege('anon', format('public.%I', e.table_name), 'DELETE')
  END AS anon_delete,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE has_table_privilege('anon', format('public.%I', e.table_name), 'TRUNCATE')
  END AS anon_truncate,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE has_table_privilege('authenticated', format('public.%I', e.table_name), 'SELECT')
  END AS auth_select,
  CASE
    WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN NULL
    ELSE has_table_privilege('service_role', format('public.%I', e.table_name), 'SELECT')
  END AS service_select
FROM expected e
LEFT JOIN pg_class c
  ON c.oid = to_regclass(format('public.%I', e.table_name))
ORDER BY e.table_name;

-- After Phase 1.11C …130000: anon/authenticated/PUBLIC must have ZERO privileges
-- on every present service-only table. data_retention_settings is created by 1.11B.

-- -----------------------------------------------------------------------------
-- SECTION 5 — Public table RLS summary
-- Baseline expectation from Phase 1.11 health audit: all public tables RLS-enabled;
-- FORCE RLS not required (F-SEC-007 accepted as soft).
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_5_RLS_SUMMARY' AS section,
  COUNT(*) AS total_tables,
  COUNT(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled,
  COUNT(*) FILTER (WHERE NOT c.relrowsecurity) AS rls_disabled,
  COUNT(*) FILTER (WHERE c.relforcerowsecurity) AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r';

SELECT
  'SECTION_5_RLS_DISABLED_TABLES' AS section,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY 1;

-- -----------------------------------------------------------------------------
-- SECTION 6 — Storage policies (Phase 1.11A expected deny policies)
-- Expected policy names:
--   phase111a_deny_anon_auth_blog_media
--   phase111a_deny_anon_auth_campaign_media
--   phase111a_deny_anon_auth_booking_service_photos
--   phase111a_deny_anon_auth_expense_receipts
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_6_STORAGE_BUCKETS' AS section,
  id,
  name,
  public,
  file_size_limit
FROM storage.buckets
WHERE id IN ('blog-media', 'campaign-media', 'booking-service-photos', 'expense-receipts')
ORDER BY name;

SELECT
  'SECTION_6_STORAGE_OBJECT_POLICIES' AS section,
  policyname,
  cmd,
  roles::text AS roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;

SELECT
  'SECTION_6_STORAGE_RLS' AS section,
  c.relname,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (
    SELECT COUNT(*)
    FROM pg_policy pol
    WHERE pol.polrelid = c.oid
  ) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage'
  AND c.relname IN ('objects', 'buckets')
ORDER BY 1;

-- -----------------------------------------------------------------------------
-- SECTION 7 — Privileged SECURITY DEFINER EXECUTE matrix (Phase 1.11A)
-- Expected after lockdown:
--   admin_mark_payout_paid / invoke_nextjs_cron / apply_cleaning_credit_transaction /
--     accept_dispatch_offer_atomic / prune_*: anon=false auth=false service=true
--   public_review_banner_stats / public_marketing_reviews_for_area: anon=true auth=true
--   user_owns_booking / user_has_booking_with_cleaner: anon=false auth=true
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_7_DEFINER_EXECUTE' AS section,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec,
  COALESCE(array_to_string(p.proconfig, ';'), '') AS proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef IS TRUE
  AND p.proname IN (
    'admin_mark_payout_paid',
    'invoke_nextjs_cron',
    'apply_cleaning_credit_transaction',
    'accept_dispatch_offer_atomic',
    'public_review_banner_stats',
    'public_marketing_reviews_for_area',
    'user_owns_booking',
    'user_has_booking_with_cleaner',
    'prune_system_logs',
    'prune_notification_logs'
  )
ORDER BY p.proname, 2;

SELECT
  'SECTION_7_DEFINER_ANON_EXEC_COUNT' AS section,
  COUNT(*) AS definer_with_anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef IS TRUE
  AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- Phase 1.11C WhatsApp helpers (invoker or otherwise) — service_role only expected
SELECT
  'SECTION_7_WHATSAPP_HELPERS' AS section,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_pending_whatsapp_jobs', 'get_whatsapp_queue_status_metrics')
ORDER BY 1, 2;

-- Phase 1.11B prune signature presence
SELECT
  'SECTION_7_PRUNE_SIGNATURES' AS section,
  to_regprocedure('public.prune_notification_logs(integer,integer)') IS NOT NULL AS prune_notification_logs_ii,
  to_regprocedure('public.prune_system_logs(integer,integer)') IS NOT NULL AS prune_system_logs_ii,
  to_regprocedure('public.prune_system_logs(integer)') IS NOT NULL AS prune_system_logs_i;

-- -----------------------------------------------------------------------------
-- SECTION 8 — Dangerous client table privileges (Phase 1.11C …130100)
-- Expected after strip: 0 TRUNCATE / TRIGGER / REFERENCES / MAINTAIN for anon+auth
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_8_DANGEROUS_PRIVILEGE_COUNTS' AS section,
  COUNT(*) FILTER (WHERE privilege_type = 'TRUNCATE' AND grantee = 'anon') AS anon_truncate,
  COUNT(*) FILTER (WHERE privilege_type = 'TRUNCATE' AND grantee = 'authenticated') AS auth_truncate,
  COUNT(*) FILTER (WHERE privilege_type = 'TRIGGER' AND grantee = 'anon') AS anon_trigger,
  COUNT(*) FILTER (WHERE privilege_type = 'TRIGGER' AND grantee = 'authenticated') AS auth_trigger,
  COUNT(*) FILTER (WHERE privilege_type = 'REFERENCES' AND grantee = 'anon') AS anon_references,
  COUNT(*) FILTER (WHERE privilege_type = 'REFERENCES' AND grantee = 'authenticated') AS auth_references,
  COUNT(*) FILTER (WHERE privilege_type = 'MAINTAIN' AND grantee = 'anon') AS anon_maintain,
  COUNT(*) FILTER (WHERE privilege_type = 'MAINTAIN' AND grantee = 'authenticated') AS auth_maintain
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated');

-- -----------------------------------------------------------------------------
-- SECTION 9 — Sequence privileges (bookings_reference_seq)
-- After Phase 1.11C: anon/authenticated revoked; service_role granted
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_9_SEQUENCE_PRIVILEGES' AS section,
  has_sequence_privilege('anon', 'public.bookings_reference_seq', 'USAGE') AS anon_usage,
  has_sequence_privilege('anon', 'public.bookings_reference_seq', 'SELECT') AS anon_select,
  has_sequence_privilege('authenticated', 'public.bookings_reference_seq', 'USAGE') AS auth_usage,
  has_sequence_privilege('authenticated', 'public.bookings_reference_seq', 'SELECT') AS auth_select,
  has_sequence_privilege('service_role', 'public.bookings_reference_seq', 'USAGE') AS service_usage;

-- -----------------------------------------------------------------------------
-- SECTION 10 — Default privileges (Phase 1.11C …130200)
-- Expected: postgres IN SCHEMA public no longer defaults ALL to anon/authenticated
-- for tables/sequences/functions; service_role/postgres retain ALL.
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_10_DEFAULT_PRIVILEGES' AS section,
  r.rolname AS owner_role,
  COALESCE(n.nspname, '-') AS schema_name,
  d.defaclobjtype AS objtype,
  grantee.rolname AS grantee,
  privilege_type,
  is_grantable
FROM pg_default_acl d
JOIN pg_roles r ON r.oid = d.defaclrole
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) acl(grantor, grantee, privilege_type, is_grantable)
JOIN pg_roles grantee ON grantee.oid = acl.grantee
WHERE r.rolname = 'postgres'
  AND (n.nspname IS NULL OR n.nspname IN ('public', 'storage'))
ORDER BY schema_name, objtype, grantee, privilege_type;

-- -----------------------------------------------------------------------------
-- SECTION 11 — Admin views security_invoker (Phase 1.11B)
-- Expected: security_invoker=true; anon/authenticated SELECT=false; service SELECT=true
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_11_ADMIN_VIEWS' AS section,
  c.relname AS view_name,
  COALESCE(
    (
      SELECT option_value
      FROM pg_options_to_table(c.reloptions)
      WHERE option_name = 'security_invoker'
    ),
    'false'
  ) AS security_invoker,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
  has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname LIKE 'admin_%'
ORDER BY 1;

SELECT
  'SECTION_11_JOB_OFFERS_VIEW' AS section,
  c.relname AS view_name,
  COALESCE(
    (
      SELECT option_value
      FROM pg_options_to_table(c.reloptions)
      WHERE option_name = 'security_invoker'
    ),
    'false'
  ) AS security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname = 'job_offers';

-- -----------------------------------------------------------------------------
-- SECTION 12 — Retention controls object (Phase 1.11B)
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_12_RETENTION_TABLE' AS section,
  EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'data_retention_settings'
  ) AS data_retention_settings_exists;

-- Retention row contents: run only if SECTION_12 reports exists=true.
-- Intentionally omitted as an unconditional statement so this file does not
-- fail when public.data_retention_settings is absent (pre-1.11B production).
-- Operator optional follow-up (still read-only):
--   SELECT table_name, retention_days, batch_size, prune_enabled
--   FROM public.data_retention_settings ORDER BY table_name;

-- -----------------------------------------------------------------------------
-- SECTION 13 — Cascade FK audit comments (Phase 1.11B …120400)
-- Expected comment prefix: 'AUDIT Phase 1.11B'
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_13_CASCADE_FK_COMMENTS' AS section,
  con.conname,
  rel.relname AS child_table,
  CASE con.confdeltype
    WHEN 'c' THEN 'CASCADE'
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE con.confdeltype::text
  END AS on_delete,
  LEFT(COALESCE(obj_description(con.oid, 'pg_constraint'), ''), 120) AS comment_prefix,
  CASE
    WHEN COALESCE(obj_description(con.oid, 'pg_constraint'), '') LIKE 'AUDIT Phase 1.11B%'
      THEN 'MATCH'
    ELSE 'MISSING_COMMENT'
  END AS comment_class
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND con.contype = 'f'
  AND con.conname IN (
    'cleaner_earnings_booking_id_fkey',
    'cleaner_earnings_cleaner_id_fkey',
    'cleaner_payouts_cleaner_id_fkey',
    'monthly_invoices_customer_id_fkey',
    'cleaning_credit_transactions_user_id_fkey',
    'booking_line_items_booking_id_fkey',
    'payout_transfers_payout_id_fkey',
    'monthly_invoice_events_invoice_id_fkey',
    'invoice_adjustments_customer_id_fkey',
    'payout_transfers_cleaner_id_fkey',
    'payout_transfer_outbox_cleaner_id_fkey',
    'earnings_disbursement_transfers_cleaner_id_fkey',
    'cleaner_earnings_disbursements_cleaner_id_fkey',
    'cleaner_earnings_adjustments_booking_id_fkey',
    'cleaner_earnings_adjustments_cleaner_id_fkey',
    'cleaner_earnings_disputes_booking_id_fkey',
    'cleaner_earnings_disputes_cleaner_id_fkey',
    'booking_roster_member_payouts_booking_id_fkey',
    'team_job_member_payouts_booking_id_fkey',
    'booking_cleaner_earnings_snapshot_booking_id_fkey',
    'admin_earnings_actions_booking_id_fkey'
  )
ORDER BY child_table, conname;

-- -----------------------------------------------------------------------------
-- SECTION 14 — Critical constraint/index smoke checks (baseline compatibility)
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_14_CRITICAL_OBJECTS' AS section,
  to_regclass('public.bookings') IS NOT NULL AS bookings_exists,
  to_regclass('public.cleaners') IS NOT NULL AS cleaners_exists,
  to_regclass('public.system_logs') IS NOT NULL AS system_logs_exists,
  to_regclass('public.notification_logs') IS NOT NULL AS notification_logs_exists,
  to_regclass('public.cleaner_earnings') IS NOT NULL AS cleaner_earnings_exists,
  to_regclass('public.monthly_invoices') IS NOT NULL AS monthly_invoices_exists,
  to_regclass('public.bookings_reference_seq') IS NOT NULL AS bookings_reference_seq_exists;

SELECT
  'SECTION_14_BOOKINGS_PK' AS section,
  con.conname,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND rel.relname = 'bookings'
  AND con.contype = 'p';

-- -----------------------------------------------------------------------------
-- SECTION 15 — Remote migration metadata (contextual; NOT proof of schema state)
-- -----------------------------------------------------------------------------
SELECT
  'SECTION_15_REMOTE_MIGRATION_METADATA' AS section,
  version,
  name
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- =============================================================================
-- END OF READ-ONLY FILE
-- No mutating statements above. Do not append GRANT/REVOKE/ALTER/CREATE/DROP.
-- =============================================================================
