# Non-production baseline sanitization

**Scope:** `20260714010000_production_baseline.sql`  
**Authorization:** isolated test project bootstrap only  
**Production data:** prohibited and absent

## Controls applied

1. The baseline is explicitly classified as non-production-only.
2. No production rows, project references, URLs, credentials, or cron schedules are included.
3. `cron_http_targets` has no environment-specific defaults; configuration must be supplied explicitly.
4. Cron HTTP execution validates a non-empty HTTPS origin and secret and otherwise fails closed.
5. `retry_unassigned_jobs()` routes through the same governed cron target instead of embedding placeholders.
6. The existing ordered hardening migrations remain authoritative for SECURITY DEFINER execution grants, security-invoker views, least-privilege table grants, storage policies, and default privileges.

## Deployment boundary

This sanitized historical baseline may be used only to initialize a new, empty, approved development or staging project. It must not be applied to production or used to copy production data.
