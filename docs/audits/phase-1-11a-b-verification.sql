-- Phase 1.11A–B verification queries (local or approved remote — READ ONLY)
-- Run after applying forward migrations locally. Do not use to mutate production.

-- =============================================================================
-- 1) SECURITY DEFINER EXECUTE grants
-- =============================================================================
SELECT
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
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
ORDER BY p.proname;

-- Expect:
-- admin_mark_payout_paid / invoke_nextjs_cron / apply_cleaning_credit_transaction /
--   accept_dispatch_offer_atomic: anon=false, auth=false, service=true
-- public_review_banner_stats / public_marketing_reviews_for_area: anon=true, auth=true, service=true
-- user_owns_booking / user_has_booking_with_cleaner: anon=false, auth=true, service=true

-- Any remaining DEFINER still executable by anon (should be ONLY marketing allowlist):
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef IS TRUE
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1, 2;

-- =============================================================================
-- 2) Storage policies + buckets
-- =============================================================================
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('blog-media', 'campaign-media', 'booking-service-photos', 'expense-receipts')
ORDER BY name;

SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- Expect 4 phase111a_deny_* policies

-- =============================================================================
-- 3) Admin views security_invoker
-- =============================================================================
SELECT c.relname AS view_name,
  COALESCE(
    (SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'),
    'false'
  ) AS security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname LIKE 'admin_%'
ORDER BY 1;

-- Expect security_invoker = true for all 12 admin_* views

SELECT table_name, privilege_type, grantee
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'admin_%'
  AND grantee IN ('anon', 'authenticated')
ORDER BY 1, 3, 2;
-- Expect 0 rows

-- =============================================================================
-- 4) Retention configuration (no surprise deletes)
-- =============================================================================
SELECT * FROM public.data_retention_settings ORDER BY table_name;
-- Expect notification_logs.prune_enabled = false
-- Expect system_logs.prune_enabled = true, retention_days = 30

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('prune_system_logs', 'prune_notification_logs')
ORDER BY 1, 2;

-- Soft check: calling prune_notification_logs should RAISE while prune_enabled=false
-- (run only in local): SELECT public.prune_notification_logs();

-- =============================================================================
-- 5) CASCADE financial FKs (inventory / comment presence)
-- =============================================================================
SELECT
  con.conname,
  rel.relname AS child_table,
  conf.relname AS parent_table,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete,
  obj_description(con.oid, 'pg_constraint') AS comment
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_class conf ON conf.oid = con.confrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND con.contype = 'f'
  AND con.confdeltype = 'c'
  AND rel.relname IN (
    'cleaner_earnings', 'cleaner_payouts', 'monthly_invoices',
    'cleaning_credit_transactions', 'booking_line_items', 'payout_transfers',
    'monthly_invoice_events', 'invoice_adjustments', 'payout_transfer_outbox',
    'earnings_disbursement_transfers', 'cleaner_earnings_disbursements',
    'cleaner_earnings_adjustments', 'cleaner_earnings_disputes',
    'booking_roster_member_payouts', 'team_job_member_payouts',
    'booking_cleaner_earnings_snapshot', 'admin_earnings_actions'
  )
ORDER BY child_table, conname;

-- =============================================================================
-- 6) Remote schema_migrations reconciliation helpers (documentation support)
-- =============================================================================
-- Local after reset should list baseline + 1.11A-B stamps:
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
