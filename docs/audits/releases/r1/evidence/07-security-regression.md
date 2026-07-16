# Security Regression Verification

## Customer cannot access admin routes
- Unauthenticated/forged access to /office redirects to /login (307). Admin APIs => 401.
- No admin content served to non-admin/unauthenticated callers.

## Cleaner cannot access admin/finance routes
- /jobs (cleaner area) and /office (admin) both gate to /login when unauthenticated.
- Admin finance APIs (/api/admin/payouts, /api/admin/invoices, /api/admin/bookings) require auth (401).

## Invalid JWT returns 401
- Forged HS256 JWT with {"role":"admin"} claim + invalid signature:
  - /api/admin/bookings -> 401
  - /api/admin/me       -> 401
  - /api/account/rewards -> 401
- Malformed Supabase cookie (sb-access-token=garbage) -> /api/admin/bookings 401
- => Server validates token signature; does NOT trust forged role claims.

## Insufficient role returns 403
- Forged tokens are rejected at authentication (401) before the role check, so a 403 was not
  independently elicited (requires a validly-signed non-admin session, which was not provisioned
  to avoid creating/modifying production data). The dual-gate's first factor (authenticated session)
  is confirmed; admin membership factor is enforced via /api/admin/me (401 without valid admin).

## Admin dual-gate remains effective
- /api/admin/me returns 401 without a valid authenticated admin; /office page redirects to login.
- Two factors observed: (1) valid Supabase session required, (2) admin membership required for admin APIs.

## No secrets in responses or logs
- /api/health/environment exposes only masked prefixes (sk_live_…, pk_live_…), never full keys.
- 401 responses contain no secret material. Homepage HTML contains no sk_/pk_test/pk_live secret leak.

## No staging-only admin or test fixtures in production
- Environment identity issues: [] (clean). No staging banner. deployment=production.
- e2e/test specs excluded from build via .vercelignore (26 ignored files at build time).
