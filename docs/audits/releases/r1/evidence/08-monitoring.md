# Post-Deploy Monitoring Evidence

Observation window: ~2026-07-16 16:58 UTC (deploy READY) → ~17:24 UTC (>25 min).

## Which deployment serves the production apex (definitive proof)
Runtime error aggregation initially attributed some legacy error signatures to an
older deployment (`dpl_ErXv83...`, commit `45ccd98`), and that deployment's cached
alias array still listed `shalean.co.za`. To remove ambiguity we proved the live
apex code version by hitting routes that exist ONLY in the released commit.

Routes checked for existence in git history:
- `apps/web/app/api/cron/ops-health/route.ts`        → ABSENT @45ccd98, ABSENT @7b49b3a
- `apps/web/app/api/cron/notification-health/route.ts` → ABSENT @45ccd98
- `apps/web/app/api/admin/email/health/route.ts`     → ABSENT @45ccd98, ABSENT @7b49b3a
- `apps/web/app/api/admin/cron-health/route.ts`      → ABSENT @45ccd98
- `apps/web/app/api/booking-v2/team-availability/route.ts` → ABSENT @45ccd98

Live origin responses on the apex `https://shalean.co.za`:
- `/api/cron/ops-health`            → 401 (auth-gated, live origin)
- `/api/cron/notification-health`   → 405 (live origin)
- `/api/admin/email/health`         → 401 (live origin)
- `/api/booking-v2/team-availability` → 400 (live origin)

Conclusion: these routes are absent at both prior commits (`45ccd98`, `7b49b3a`)
yet resolve live on the apex. The ONLY deployment containing them is
`dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw` (commit `6ca3da6`, Merge PR #24). Therefore the
production apex is serving the released code. `get_project.latestDeployment` also
equals `dpl_6RZTr...`. The stale alias array on the old deployment was an outdated
API snapshot.

## Vercel runtime logs — new deployment (dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw)
- Query: level in [error, fatal], since 45m → **No logs found** (zero error/fatal).
- Functional smoke traffic during window returned 200 / expected auth codes.

## Pre-existing runtime error signatures (NOT release regressions)
Runtime-error aggregation surfaced these signatures; all first-seen BEFORE this
release, so they are not introduced by PR #24:
1. `/blog/[slug]` 404 fallback + `buildBlogMetadata` 404 — benign missing-post 404
   (first seen ~Jul 9). Happy path unaffected.
2. `/api/booking/time-slots` — `column bookings.booking_date does not exist` in an
   eligible-cleaner fallback query (first seen ~Jul 12, low frequency). The
   user-facing `/api/booking/time-slots` happy path returns 200 in smoke tests.
   Logged to backlog as a pre-existing bug; not a release blocker.

## Supabase advisors (security)
- Levels: 0 ERROR, 177 WARN, 94 INFO.
- Categories: `function_search_path_mutable`, `rls_enabled_no_policy`,
  `extension_in_public` (pg_net), `anon_security_definer_function_executable`.
- These are pre-existing database-posture items. This release applied NO migration,
  so the advisor posture is unchanged from pre-release. All are backlog items, none
  are release regressions or ERROR-level.

## Supabase runtime / auth
- No new Supabase error surge observed tied to the deployment window.
- Auth boundaries behaved correctly during smoke tests (401 for invalid JWT,
  redirects for unauthenticated protected pages) — see evidence 06 & 07.

## Cron health
- Cron routes are auth-gated (401/405 without valid CRON_SECRET) — enforcement
  verified. No mutating cron was manually executed.

## New Critical/High issues introduced by this release
- **None.** Zero error/fatal logs on the new deployment; all surfaced error
  signatures and DB advisors are pre-existing and unchanged by the release.
