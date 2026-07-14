-- =============================================================================
-- READ-ONLY POST-REMEDIATION VERIFICATION (H02A / H02B)
-- NO MUTATING SQL IS PERMITTED IN THIS FILE
-- =============================================================================
-- Companion to H01.5 catalog pack. Use after Phase 1.11A–C apply (local rehearsal
-- or approved production) to confirm governed security effects are present.
--
-- Operator:
--   npx supabase db query --local  -f docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql
--   npx supabase db query --linked -f docs/audits/sql/h02a-post-remediation-verification-2026-07-14.sql
--     (linked = production ONLY after H02B approval; SELECT-only)
-- =============================================================================

-- SECTION 1 — Identity
SELECT
  'H02A_SECTION_1_IDENTITY' AS section,
  current_database() AS database,
  current_user AS db_user,
  version() AS server_version,
  now() AS observed_at,
  current_setting('search_path') AS search_path;

-- SECTION 2 — Migration history (metadata)
SELECT
  'H02A_SECTION_2_MIGRATIONS' AS section,
  version,
  name
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- SECTION 3 — RLS enablement
SELECT
  'H02A_SECTION_3_RLS' AS section,
  count(*) FILTER (WHERE c.relrowsecurity) AS rls_on,
  count(*) FILTER (WHERE NOT c.relrowsecurity) AS rls_off,
  count(*) AS public_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r';

-- SECTION 4 — Phase 1.11A storage deny policies
SELECT
  'H02A_SECTION_4_STORAGE_DENY_POLICIES' AS section,
  policyname,
  roles::text AS roles,
  cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'phase111a_deny_%'
ORDER BY policyname;

-- Expect exactly 4 rows.

-- SECTION 5 — Phase 1.11B retention objects
SELECT
  'H02A_SECTION_5_RETENTION' AS section,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'data_retention_settings'
  ) AS has_data_retention_settings,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prune_notification_logs'
      AND pg_get_function_identity_arguments(p.oid) = 'p_retention_days integer, p_batch_size integer'
  ) AS has_prune_notification_logs_2arg,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prune_system_logs'
      AND pg_get_function_identity_arguments(p.oid) = 'p_retention_days integer, p_batch_size integer'
  ) AS has_prune_system_logs_2arg;

-- SECTION 6 — Admin views security_invoker
SELECT
  'H02A_SECTION_6_ADMIN_VIEWS' AS section,
  c.relname AS view_name,
  COALESCE(
    (
      SELECT bool_or(option_value = 'true')
      FROM pg_options_to_table(c.reloptions)
      WHERE option_name = 'security_invoker'
    ),
    false
  ) AS security_invoker,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
  has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname LIKE 'admin_%'
ORDER BY c.relname;

-- SECTION 7 — Dangerous client table privileges (expect 0)
SELECT
  'H02A_SECTION_7_DANGEROUS_PRIVS' AS section,
  count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'TRUNCATE')) AS anon_truncate,
  count(*) FILTER (WHERE has_table_privilege('authenticated', c.oid, 'TRUNCATE')) AS auth_truncate,
  count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'TRIGGER')) AS anon_trigger,
  count(*) FILTER (WHERE has_table_privilege('authenticated', c.oid, 'TRIGGER')) AS auth_trigger,
  count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'REFERENCES')) AS anon_references,
  count(*) FILTER (WHERE has_table_privilege('authenticated', c.oid, 'REFERENCES')) AS auth_references
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r';

-- SECTION 8 — bookings_reference_seq
SELECT
  'H02A_SECTION_8_SEQUENCE' AS section,
  has_sequence_privilege('anon', 'public.bookings_reference_seq', 'USAGE') AS anon_usage,
  has_sequence_privilege('anon', 'public.bookings_reference_seq', 'SELECT') AS anon_select,
  has_sequence_privilege('authenticated', 'public.bookings_reference_seq', 'USAGE') AS auth_usage,
  has_sequence_privilege('authenticated', 'public.bookings_reference_seq', 'SELECT') AS auth_select,
  has_sequence_privilege('service_role', 'public.bookings_reference_seq', 'USAGE') AS service_usage;

-- SECTION 9 — Privileged DEFINER sample + anon surface count
SELECT
  'H02A_SECTION_9_DEFINER_SAMPLES' AS section,
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_mark_payout_paid',
    'invoke_nextjs_cron',
    'apply_cleaning_credit_transaction',
    'accept_dispatch_offer_atomic',
    'user_owns_booking',
    'user_has_booking_with_cleaner',
    'public_review_banner_stats',
    'public_marketing_reviews_for_area',
    'get_pending_whatsapp_jobs',
    'get_whatsapp_queue_status_metrics'
  )
ORDER BY p.proname;

SELECT
  'H02A_SECTION_9B_DEFINER_ANON_COUNT' AS section,
  count(*) AS public_definer_with_anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- Expect 2 (marketing allowlist only).

-- SECTION 10 — Default privileges to client roles (expect 0 table/seq/fn for anon/auth)
SELECT
  'H02A_SECTION_10_DEFAULT_ACL' AS section,
  pg_get_userbyid(d.defaclrole) AS grantor_role,
  n.nspname AS schema_name,
  d.defaclobjtype AS object_type,
  e.grantee::regrole::text AS grantee,
  e.privilege_type
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) e
WHERE n.nspname = 'public'
  AND pg_get_userbyid(d.defaclrole) = 'postgres'
  AND e.grantee IN ('anon'::regrole, 'authenticated'::regrole)
ORDER BY d.defaclobjtype, e.grantee::regrole::text, e.privilege_type;

-- SECTION 11 — Schema CREATE denied
SELECT
  'H02A_SECTION_11_SCHEMA' AS section,
  has_schema_privilege('anon', 'public', 'USAGE') AS anon_usage,
  has_schema_privilege('anon', 'public', 'CREATE') AS anon_create,
  has_schema_privilege('authenticated', 'public', 'USAGE') AS auth_usage,
  has_schema_privilege('authenticated', 'public', 'CREATE') AS auth_create;

-- SECTION 12 — Sample CASCADE FK audit comments (Phase 1.11B)
SELECT
  'H02A_SECTION_12_FK_COMMENTS' AS section,
  c.conname,
  obj_description(c.oid, 'pg_constraint') AS comment_text
FROM pg_constraint c
JOIN pg_class rel ON rel.oid = c.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND c.conname IN (
    'cleaner_earnings_booking_id_fkey',
    'monthly_invoices_customer_id_fkey',
    'cleaning_credit_transactions_user_id_fkey'
  )
ORDER BY c.conname;

-- =============================================================================
-- PASS CRITERIA (post Phase 1.11A–C):
--   * SECTION_3: rls_off = 0
--   * SECTION_4: exactly 4 phase111a_deny_* policies
--   * SECTION_5: all three true
--   * SECTION_6: security_invoker true; anon/auth SELECT false; service true
--   * SECTION_7: all dangerous counts = 0
--   * SECTION_8: anon/auth USAGE+SELECT false; service USAGE true
--   * SECTION_9: privileged samples anon_exec false; marketing allowlist true;
--                RLS helpers anon false / auth true; WhatsApp helpers anon/auth false
--   * SECTION_9B: count = 2
--   * SECTION_10: zero rows (no postgres→anon/authenticated defaults)
--   * SECTION_11: CREATE false for anon/auth
--   * SECTION_12: comments contain 'AUDIT Phase 1.11B'
--   * SECTION_2: includes baseline + eight Phase 1.11 versions (target model dependent
--                for archaeology rows)
-- =============================================================================
