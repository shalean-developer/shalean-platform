-- Phase 1.11C — Strip dangerous privileges still held by anon/authenticated
-- Audit: F-SEC-005
--
-- Client roles historically received GRANT ALL (including TRUNCATE / TRIGGER /
-- REFERENCES / MAINTAIN) on user-facing tables. Application code never needs those
-- for PostgREST clients — only SELECT/INSERT/UPDATE/DELETE used via RLS.
--
-- Preserves DML grants required by authenticated/anon RLS policies and browser/RSC
-- .from() usage (bookings, user_profiles, blog_*, etc.).
--
-- Scope: strip dangerous TABLE privileges for anon/authenticated across public;
-- plus bookings_reference_seq and two WhatsApp queue helper functions.
-- Types remain out of scope. Does NOT revoke from service_role / postgres /
-- supabase_admin. Does NOT use REVOKE … FROM PUBLIC.

BEGIN;

-- Why: remove catastrophic capabilities if an RLS policy is ever too broad.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Why: booking reference assignment runs in SECURITY DEFINER / trigger context;
-- clients never need sequence privileges (repo uses service_role or triggers).
REVOKE ALL ON SEQUENCE public.bookings_reference_seq FROM anon;
REVOKE ALL ON SEQUENCE public.bookings_reference_seq FROM authenticated;
GRANT ALL ON SEQUENCE public.bookings_reference_seq TO service_role;

-- Ops RPC helpers that are SECURITY INVOKER (or non-DEFINER) but only called with admin.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_pending_whatsapp_jobs',
        'get_whatsapp_queue_status_metrics'
      )
  LOOP
    -- Why: WhatsApp queue drain is service_role/edge only (queue.ts, whatsapp-worker).
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

COMMIT;
