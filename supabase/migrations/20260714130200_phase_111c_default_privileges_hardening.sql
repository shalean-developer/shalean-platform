-- Phase 1.11C — Stop dump-pattern default privileges for future objects
-- Audit: F-SEC-005 / default privilege amplifier
--
-- Baseline ALTER DEFAULT PRIVILEGES granted ALL on TABLES/SEQUENCES/FUNCTIONS
-- created by role postgres to anon + authenticated. That reopens privilege debt
-- on every new migration object. Close the amplifier; service_role retains ALL.
--
-- Owner/schema: FOR ROLE postgres IN SCHEMA public (migration object owner).
-- TYPES default privileges are out of scope for 1.11C.
-- Does NOT revoke default privileges from service_role or postgres.

BEGIN;

-- Why: future tables must not auto-grant ALL (incl. TRUNCATE) to public API roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;

-- Why: keep service_role and postgres able to use newly created objects.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;

COMMENT ON SCHEMA public IS
  'Phase 1.11C: default privileges no longer auto-grant ALL to anon/authenticated. New public objects need explicit GRANT + RLS.';

COMMIT;
