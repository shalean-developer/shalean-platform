-- Phase 1.11A — P0: Lock down SECURITY DEFINER EXECUTE privileges
-- Audit: docs/audits/phase-1-11-database-health-audit-2026-07-14.md (F-SEC-001, F-SEC-002)
--
-- Does NOT modify function bodies or search_path.
-- Default: privileged DEFINER RPCs → service_role EXECUTE only.
-- Exceptions (repository evidence):
--   * public_review_banner_stats() — anon via getSupabaseServer() (apps/web/lib/home/reviewBannerStats.ts)
--   * public_marketing_reviews_for_area(text,integer) — anon via getSupabaseServer()
--   * user_owns_booking(uuid), user_has_booking_with_cleaner(uuid) — authenticated RLS helpers
-- invoke_nextjs_cron: service_role only (pg_cron / privileged DB roles execute without anon grant)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Revoke PUBLIC / anon / authenticated from all public SECURITY DEFINER
--    functions, then grant EXECUTE to service_role.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  keep_names text[] := ARRAY[
    'public_review_banner_stats',
    'public_marketing_reviews_for_area',
    'user_owns_booking',
    'user_has_booking_with_cleaner'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef IS TRUE
      AND NOT (p.proname = ANY (keep_names))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Explicit allowlist for marketing RPCs (anon + authenticated + service_role)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.public_review_banner_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_review_banner_stats() FROM anon;
REVOKE ALL ON FUNCTION public.public_review_banner_stats() FROM authenticated;
REVOKE ALL ON FUNCTION public.public_review_banner_stats() FROM service_role;
GRANT EXECUTE ON FUNCTION public.public_review_banner_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.public_review_banner_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_review_banner_stats() TO service_role;

REVOKE ALL ON FUNCTION public.public_marketing_reviews_for_area(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_marketing_reviews_for_area(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.public_marketing_reviews_for_area(text, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.public_marketing_reviews_for_area(text, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.public_marketing_reviews_for_area(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.public_marketing_reviews_for_area(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_marketing_reviews_for_area(text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) RLS helper functions — authenticated (+ service_role); NOT anon
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.user_owns_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_owns_booking(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_owns_booking(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.user_owns_booking(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.user_owns_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_booking(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.user_has_booking_with_cleaner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_booking_with_cleaner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_has_booking_with_cleaner(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.user_has_booking_with_cleaner(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.user_has_booking_with_cleaner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_booking_with_cleaner(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Belt-and-suspenders: invoke_nextjs_cron must not be anon/authenticated
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.invoke_nextjs_cron(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_nextjs_cron(text) FROM anon;
REVOKE ALL ON FUNCTION public.invoke_nextjs_cron(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_nextjs_cron(text) TO service_role;

COMMENT ON FUNCTION public.invoke_nextjs_cron(text) IS
  'Phase 1.11A: EXECUTE limited to service_role (and superuser/pg_cron owners). Do not grant to anon/authenticated.';

COMMIT;
