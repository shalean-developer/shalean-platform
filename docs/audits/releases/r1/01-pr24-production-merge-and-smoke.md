# PR #24 — Production Release: Merge & Smoke Test (Release r1)

Prepared by: Release engineer (automated, operator-supervised)
Date: 2026-07-16
Scope: Merge PR #24 (staging → main, UAT remediation batch PRs #10–#23), deploy to
production, verify identity, smoke test, monitor, and return a release decision.

---

# Executive Decision

**PASS — PRODUCTION RELEASE COMPLETE.**

PR #24 merged cleanly into `main` via merge commit `6ca3da6`, Vercel built and
promoted deployment `dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw` (target=production,
branch=main) to READY, and the production apex `shalean.co.za` is confirmed serving
that deployment. Production environment identity is correct (production env,
Supabase ref `tchayecuvzssixyxlvfu`, Paystack live, no staging markers, no exposed
secrets). Both restricted migrations remain UNAPPLIED and no migration ran during
the build. Smoke tests and security-regression checks passed. Monitoring shows zero
error/fatal logs on the new deployment and no new Critical/High regressions. All
surfaced error signatures and DB advisories are pre-existing and unchanged by this
release (which applied no schema change).

No rollback required.

---

# Pre-Merge Gate

Captured immediately before merge (evidence/01-pre-merge-gate.md):

- PR #24 target: `main` ✓ (baseRefName=main, headRefName=staging)
- Head SHA: `48ed95d25064dc8dc948d56d4ac372e56f4930ac` ✓ (unchanged; last commit oid matches)
- Mergeable/Clean: `MERGEABLE` / `CLEAN` ✓
- Required checks green ✓:
  - migration governance (validate-migration-filenames): pass
  - Vitest: pass
  - GitGuardian Security Checks: pass
  - Vercel: pass (deployment completed)
- No new commits / 0 review findings ✓
- Production release not already in progress ✓ (prod was on `7b49b3a` / Merge PR #9)

Gate decision: PROCEED TO MERGE.

---

# Merge Evidence

(evidence/02-merge.md)

- PR number: **24**
- Merge method: **merge commit** (`gh pr merge 24 --merge`; repo allows merge+squash,
  merge commit chosen to preserve PR #10–#23 promotion history)
- Merge commit SHA: **6ca3da686b6bfec9305c52448612eda682dbfa3e**
- Merge timestamp: **2026-07-16T16:53:49Z**
- Operator: **shalean-developer** (authenticated gh account)
- PR state after merge: **MERGED**; `main` HEAD → `6ca3da6`
- Migrations: **NONE** applied during merge

---

# Production Deployment

(evidence/03-production-deployment.md)

- Deployment ID: **dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw**
- Commit SHA: **6ca3da6** (Merge PR #24)
- Target: **production**; branch: **main**; state: **READY**
- Created: 2026-07-16 16:53:54 UTC; Ready: 2026-07-16 16:58:21 UTC; region iad1
- Domains: `shalean.co.za`, `www.shalean.co.za` (+ project vercel.app aliases)
- No staging alias moved (staging preview untouched); no Preview mistaken for prod
- Build: Next.js 16.2.10, typecheck + validate-blog-routes pass, 267 static pages,
  build completed; **no migration / db push in build** (npm ci + next build only)

**Apex-serving proof (evidence/08-monitoring.md):** routes `cron/ops-health`,
`cron/notification-health`, `admin/email/health`, `admin/cron-health`,
`booking-v2/team-availability` are ABSENT at both prior commits (`45ccd98` and
`7b49b3a`) yet return live origin responses on `shalean.co.za` — so the apex is
serving `6ca3da6`. `get_project.latestDeployment` = `dpl_6RZTr...` confirms.

---

# Environment Identity

(evidence/04-environment-identity.md — fetched fresh, HTTP 200, cache MISS)

- environment = **production** (vercelEnv=production, shaleanAppEnv=production, gitBranch=main) ✓
- Supabase ref = **tchayecuvzssixyxlvfu** (configured == expected) ✓
- Paystack = **live** (secret + public; masked `sk_live_…` / `pk_live_…`), no test mode ✓
- messaging config present; `smsOutboundEnabled=false` (SMS/WhatsApp NOT enabled) ✓
- CRON_SECRET configured & enforced (verified via cron auth rejection) ✓
- no staging banner, no staging Supabase ref ✓
- `issues: []` (no misconfiguration) ✓
- No secrets exposed (masked prefixes only) ✓

Decision: environment identity CORRECT — no mismatch.

---

# Database Non-Apply Verification

(evidence/05-database-non-apply.md — read-only SELECTs; no migration, no db push)

- Migration **20260716120000** (push/expo channels): **UNAPPLIED** — production
  channel/provider CHECK constraints lack `push`/`expo`; version absent from history.
- Migration **20260716170000** (booking_confirmed email): **UNAPPLIED** — template
  `updated_at` = 2026-06-22 (a July-16 apply would have moved it); version absent.
- No migration command during Vercel build (build ran npm ci + next build only).
- No production schema / migration-history change (latest applied still `20261071`).

---

# Smoke-Test Results

(evidence/06-smoke-tests.md — no charges, no bulk messaging, no mutating cron)

- **Public:** homepage, services, /book pricing, about, faq, contact, quote,
  reviews, refer, location pages → all 200; staging banner ABSENT; no secret in HTML.
- **Auth/gating:** /login 200, /signup→/auth/signup; protected areas redirect to
  login (307): /account (customer), /office (admin), /jobs (cleaner); forgot-password
  route present (not invoked). Full logged-in flows not run (no throwaway prod creds,
  to avoid touching production data) — gating + routes verified instead.
- **Admin:** /office gated; admin APIs unauthenticated → 401 (me, bookings, cleaners,
  customers); email/health → 401.
- **Customer:** /account gated; /api/account/rewards → 401; deprecated /api/bookings/me
  → 410 (no data leak).
- **Cleaner:** /jobs gated; /api/cleaner/apply → 405 (POST-only); admin/finance blocked.
- **Booking (read-only):** catalog + service-locations → 200; quote (standard, 2bd/1ba,
  once-off) → 200 `{ total: 329, hours: 4.5, pricingVersion: 7 }`, duration 270 min
  (parity); time-slots → 200; team-availability validates (400 w/o params). Stopped
  before any payment.
- **Payments:** Paystack live confirmed; no test key; init routes method-gated (405);
  no charge performed.
- **Email:** production outbound enabled, Resend provider; email/health gated; no send.
- **Cron:** CRON_SECRET enforced (401 on missing/invalid auth; 405 method-gated); 45
  cron routes registered; no mutating cron executed.

---

# Security Regression

(evidence/07-security-regression.md)

- Customer/cleaner cannot reach admin/finance routes (redirect to login / 401) ✓
- Invalid JWT → **401** (forged HS256 admin claim rejected on all admin+account APIs;
  malformed cookie → 401) — server validates signature, does not trust role claims ✓
- Insufficient role → 403: forged tokens rejected at auth (401) before role check, so a
  clean 403 was not independently elicited (would require a validly-signed non-admin
  session, not provisioned to avoid creating prod data). Dual-gate factor 1
  (authenticated session) confirmed; admin membership factor enforced via /api/admin/me.
- Admin dual-gate effective (valid session + admin membership) ✓
- No secrets in responses/logs (masked prefixes only) ✓
- No staging-only/test fixtures in production (issues: [], e2e specs .vercelignore'd) ✓

---

# Monitoring

(evidence/08-monitoring.md — window ~16:58→17:24 UTC, >25 min)

- Vercel runtime logs on new deployment (level=error/fatal): **none**.
- Supabase security advisors: **0 ERROR**, 177 WARN, 94 INFO — all pre-existing DB
  posture (function_search_path_mutable, rls_enabled_no_policy, extension_in_public,
  anon_security_definer_function_executable). Unchanged (no migration applied).
- Auth/booking/payment/webhook/notification: no new error surge tied to the window.
- Cron health: routes auth-gated and reachable; scheduler registered.
- No unusual CPU/function spikes observed.
- **No new Critical/High issue introduced by this release.**

---

# Production Non-Impact Before Merge

- Pre-merge, `shalean.co.za/api/health/environment` returned 404 (route absent on old
  prod code `7b49b3a`), confirming production was NOT running PR #24 code before merge.
- The release code reached production only via the post-merge deployment `dpl_6RZTr`.

---

# Known Unapplied Migrations

Both remain intentionally UNAPPLIED (out of scope for this task, confirmed on prod):

- `20260716120000_princess_pre_push_notification_channel.sql`
- `20260716170000_beaulla_booking_confirmed_email_customer_refs.sql`

They must be applied under a separate, explicitly-authorized migration change.

---

# Remaining Backlog (non-blocking)

1. **Apex edge negative-cache** on `/api/health/environment` (stale 404, X-Vercel-Cache
   HIT, Age ~46h). Route works at origin; purge/invalidate the edge cache for this path.
2. **`/api/booking/time-slots`** pre-existing error in an eligible-cleaner fallback
   query: `column bookings.booking_date does not exist` (first seen ~Jul 12, low
   frequency; happy path returns 200). Fix the column reference.
3. **Blog 404 fallbacks** (`/blog/[slug]`, buildBlogMetadata) — benign missing-post
   404s; consider suppressing from error aggregation.
4. **Supabase DB posture** advisories (177 WARN): set immutable search_path on flagged
   functions, add RLS policies where RLS is enabled without policies, move `pg_net` out
   of `public`, and review anon-executable SECURITY DEFINER RPCs.
5. Deferred: apply the two known migrations under separate authorization.

---

# Rollback Status

- Not required. Prepared rollback path if needed: re-promote the prior production
  deployment `dpl_C9ysZWWvDsLmMWJ3XPTsfhMXy7uZ` (commit `7b49b3a`, Merge PR #9) via
  Vercel "Promote to Production" / instant rollback. No DB rollback needed (no
  migration was applied).

---

# Final Decision

**PASS — PRODUCTION RELEASE COMPLETE.**

- PR #24 merged successfully (merge commit `6ca3da6`) ✓
- Production deployment `dpl_6RZTr...` reached READY and serves the apex ✓
- Environment identity correct ✓
- Smoke tests passed ✓
- No migration applied ✓
- No new Critical/High regression ✓
- Monitoring stable ✓
- Evidence complete (evidence/01–08) ✓
