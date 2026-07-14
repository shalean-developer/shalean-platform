-- Phase 1.11C verification SQL (local replay — READ ONLY)
-- Expect after migrations 20260714130000..20260714130200.

-- =============================================================================
-- 1) Named admin / ops tables: anon & authenticated must have ZERO privileges
-- =============================================================================
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
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
  )
  AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY 1, 2;
-- Expect: 0 rows

-- service_role still has access:
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'admin_api_idempotency'
  AND grantee = 'service_role'
ORDER BY 2;
-- Expect: multiple rows (ALL privileges)

-- =============================================================================
-- 2) Dangerous privileges must be gone for client roles on remaining tables
-- =============================================================================
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
ORDER BY 1, 2, 3;
-- Expect: 0 rows

-- =============================================================================
-- 3) Customer / marketing tables still grant needed DML/SELECT
-- =============================================================================
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'bookings',
    'user_profiles',
    'customer_saved_addresses',
    'user_notifications',
    'monthly_invoices',
    'sales_documents',
    'blog_posts',
    'locations',
    'services',
    'faqs',
    'pricing_services',
    'cleaner_earnings',
    'dispatch_offers'
  )
  AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY 1, 2;
-- Expect: SELECT (and often INSERT/UPDATE/DELETE) present where previously used;
--         NO TRUNCATE/REFERENCES/TRIGGER/MAINTAIN

-- =============================================================================
-- 4) Sequence
-- =============================================================================
SELECT grantee, privilege_type
FROM information_schema.usage_privileges
WHERE object_schema = 'public'
  AND object_name = 'bookings_reference_seq'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY 1, 2;
-- Expect: no anon/authenticated; service_role retained

-- =============================================================================
-- 5) WhatsApp queue functions
-- =============================================================================
SELECT p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_pending_whatsapp_jobs', 'get_whatsapp_queue_status_metrics');
-- Expect: anon=false, auth=false, service=true

-- =============================================================================
-- 6) Default privileges — postgres grantor must not auto-grant to anon/authenticated
-- =============================================================================
SELECT
  r.rolname AS grantor,
  n.nspname AS schema,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'table'
    WHEN 'S' THEN 'sequence'
    WHEN 'f' THEN 'function'
    ELSE d.defaclobjtype::text
  END AS objtype,
  grantee.rolname AS grantee,
  a.privilege_type
FROM pg_default_acl d
JOIN pg_roles r ON r.oid = d.defaclrole
JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
JOIN pg_roles grantee ON grantee.oid = a.grantee
WHERE n.nspname = 'public'
  AND r.rolname = 'postgres'
  AND grantee.rolname IN ('anon', 'authenticated')
ORDER BY 3, 4, 5;
-- Expect: 0 rows (no default ALL to client roles)

-- =============================================================================
-- 7) Schema USAGE retained
-- =============================================================================
SELECT has_schema_privilege('anon', 'public', 'USAGE') AS anon_usage,
  has_schema_privilege('authenticated', 'public', 'USAGE') AS auth_usage,
  has_schema_privilege('service_role', 'public', 'USAGE') AS service_usage;
-- Expect: all true

-- =============================================================================
-- 8) Role memberships (informational)
-- =============================================================================
SELECT r.rolname AS role, m.rolname AS member_of
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.member
JOIN pg_roles m ON m.oid = am.roleid
WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'authenticator')
ORDER BY 1, 2;
