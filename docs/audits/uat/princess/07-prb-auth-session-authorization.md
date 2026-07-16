# PRINCESS-UAT-PRB — Authentication, Session, and Authorization Remediation

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-PRB |
| **Audit timestamp (UTC)** | `2026-07-15T21:10:00Z` |
| **Mode** | Staging-only technical UAT (PR B) |
| **Branch** | `fix/princess-prb-auth-session-authorization` |
| **Base** | `staging` |
| **Staging URL** | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` |
| **Production Supabase** | `tchayecuvzssixyxlvfu` (untouched) |

---

# Executive Decision

**PASS — PRINCESS PR B READY FOR REVIEW**

Authentication baseline, authorization matrix, admin dual-gate, session revoke recovery, and password-reset redirect safety are verified on staging. Login latency is measured and the blocking `link-user` await is removed. Password-reset delivery false-502 (generateLink + resetPasswordForEmail rate-limit collision) is fixed in code and covered by tests; post-merge staging retest of forgot-password mail delivery remains on the Princess checklist. Production was not modified.

---

# Authentication Baseline

| Scenario | Expected | Actual (staging probe) |
|----------|----------|------------------------|
| Customer login | Session + role `customer` → `/account` | Pass (`authMs` ~300ms, `resolveProfileMs` ~750ms) |
| Cleaner login | Session + role `cleaner` → `/jobs` | Pass |
| Admin (Princess) login | Session + role `admin` → `/office` | Pass (`authMs` ~640ms, `resolveProfileMs` ~1.3s) |
| Invalid credentials | Reject safely | Pass (`Invalid login credentials`) |
| Unauthenticated `/account` | Redirect `/login?redirect=…` | Pass (`307`) |
| Revoked session → customer API | `401` | Pass |
| Unconfirmed / disabled | N/A this run (no fixture) | Documented for Princess retest |

Evidence: `docs/audits/uat/princess/evidence/prb-auth-staging-probe-2026-07-15T21085Z.json`

---

# Login Performance

## Perceived slowness (before)

Serial post-auth path in `signIn`:

1. `signInWithPassword`
2. Client `user_profiles` select/insert
3. **Awaited** `POST /api/bookings/link-user` (previously also failed with `user_id` PGRST204 on staging)
4. Login form **awaited** `POST /api/auth/resolve-profile` (required for role routing)
5. `router.replace`

Cold Vercel + resolve-profile dominate first protected load; link-user added avoidable latency on the critical path.

## Measured (staging, warm)

| Identity | Auth (ms) | Resolve-profile (ms) | Combined critical path |
|----------|-----------|----------------------|------------------------|
| Princess admin | 638 | 1343 | ~2.0s |
| Customer | 296 | 751 | ~1.0s |
| Cleaner | 302 | 1063 | ~1.4s |

## Safe optimization applied

- `linkBookingsToUserAfterAuth` is **fire-and-forget** in `signIn` / `signUp` (still runs; no longer blocks redirect).
- Security checks retained: password auth, resolve-profile role gate, middleware session refresh, Admin API allowlist.

No security checks removed for speed.

---

# Password Reset

## Root cause of staging failure

1. **Rate-limit false 502:** When Resend is unavailable, code called `admin.generateLink` then `resetPasswordForEmail` in the same request. Supabase Auth rate-limits recovery → `"you can only request this after 59 seconds"` → opaque 502.
2. **Fragile recovery bootstrap:** Reset page only polled `getSession` (~3s) and did not explicitly exchange PKCE `?code=` or hash tokens.
3. **Redirect safety:** `getPublicAppUrlBase()` could fall through to production apex if Preview env mis-set; dedicated staging-safe helper added.

## Required behavior status

| Requirement | Status |
|-------------|--------|
| Reset request succeeds | Fixed in code (single delivery path + clear `429` for rate limits); **retest after staging deploy** |
| Reset link points only to staging | **Pass** (`redirect_to` host = staging branch alias; no production leak) |
| Expired/invalid token rejected clearly | **Pass** (bootstrap helper + UI copy) |
| New password works / old fails | Princess checklist post-deploy |
| Customer returns to staging | **Pass** (redirect base + production-leak guard) |
| No production redirect | **Pass** |

---

# Session Expiry

| Case | Expected | Status |
|------|----------|--------|
| Invalid/expired Bearer | API `401` `"Invalid or expired session."` | Verified (customerBearer / requireAdminApi) |
| Global sign-out / revoked token | Subsequent API `401` | **Pass** (probe) |
| Browser refresh with cookies | Middleware `getUser` refresh | Existing proxy path retained |
| Invalid refresh / clear recovery message | Shared copy via `sessionRecovery.ts` | Added |
| Infinite redirect loop | None observed on `/account` → `/login` | Pass |
| Booking draft preservation | Unchanged (client draft storage) | No regression in this PR |

---

# Authorization Matrix

| Identity \ Surface | Public | `/account` | `/jobs` | `/office` | Admin APIs | Customer API | Cleaner API |
|--------------------|--------|------------|---------|-----------|------------|--------------|-------------|
| Unauthenticated | 200 | redirect login | redirect login | redirect login | 401 | 401 | 401 |
| Customer | 200 | allow (role) | redirect dashboard | redirect dashboard | **403** | 200 | 403 |
| Cleaner | 200 | redirect | allow | redirect | **403** | 200* | 200 |
| Admin (Princess) | 200 | allow* | redirect | allow | **200** | 200* | 403 |

\* Customer/cleaner profile endpoints may return 200 for any authenticated user where the route only checks Bearer validity; Admin Office APIs enforce allowlist. Cross-tenant booking/address ownership remains server-enforced in domain helpers (tested).

Probe highlights:

- Princess `/api/admin/teams` → **200**
- Customer `/api/admin/teams` → **403**
- Cleaner `/api/admin/teams` → **403**
- Unauth `/account` → **307** `/login`

---

# Admin Dual-Gate Review

| Gate | Mechanism | Intentional? |
|------|-----------|--------------|
| **A — UI / routing** | `user_profiles.role === admin` via `/api/auth/resolve-profile` | **Yes** — keeps Office shell role-correct |
| **B — Admin APIs** | Email ∈ `ADMIN_EMAILS` ∪ `ADMIN_EMAIL` | **Yes** — defense in depth / env-scoped ops |

**Neither gate removed.** Governance note from PRINCESS-UAT-ADMIN-01 still applies.

Improvements:

- Empty allowlist → **503** with operational message (not silent 403).
- Invalid/expired JWT → **401** (was conflated with 403).
- Allowlist / role updates still require **redeploy** (env) and/or **fresh sign-in** (role cache / JWT).

---

# Fixes

| Area | Change |
|------|--------|
| Login latency | Fire-and-forget booking link after auth |
| Password reset redirect | `getPasswordResetRedirectBase()` + production-leak guard |
| Password reset delivery | Single path (Resend **or** Supabase mailer, never both); `429` for rate limits |
| Staging outbound | Auth-critical Resend exception when marketing outbound is disabled |
| Reset page | PKCE / hash / error-query bootstrap |
| Admin API | `evaluateAdminAllowlist` dual-gate clarity |
| Session UX | `sessionRecovery.ts` shared messages |
| Probe | `scripts/env/princess-prb-auth-staging-probe.mjs` |

---

# Tests

| Suite | Result |
|-------|--------|
| `lib/auth/__tests__/princessPrbAuthSessionAuthorization.test.ts` (13) | Pass |
| `test:critical` (34) | Pass |
| Full Vitest | See `evidence-prb-vitest-full.txt` |
| `typecheck` | Pass |
| `lint:booking-core` | Pass |
| `db:migrations:validate` | Pass |
| `next build --webpack` | See evidence |

Covered: login redirect/role boundaries, password recovery bootstrap (PKCE/hash/expired), admin allowlist empty/deny/allow, session recovery copy, cross-tenant address denial, link-user non-blocking contract.

---

# Staging Verification

- Health: staging / `gbgnemlpyykyhpqqbgru` / Paystack test / messaging outbound disabled
- Probe pass: login + authz + reset redirect + revoked session
- Forgot-password HTTP 502 on **pre-PR** staging explained (rate-limit collision); fixed in this branch

---

# Production Non-Impact

| Check | Result |
|-------|--------|
| Production Supabase writes | None |
| Production Auth config | Untouched |
| Branch target | `staging` only |
| Merge to `main` / promote | Not performed |

---

# Remaining Risks

1. Forgot-password mail delivery must be retested **after this PR deploys to staging** (Resend optional; Supabase mailer single-path).
2. Staging `OUTBOUND_MESSAGING_DISABLED=true` — auth-critical Resend exception only when Resend is configured.
3. Admin allowlist remains env-coupled (redeploy + session refresh discipline).
4. Unconfirmed-email / inactive-account fixtures not exercised this run.

---

# Princess Retest Checklist

1. [ ] Sign in as customer / cleaner / Princess admin on staging; confirm dashboards.
2. [ ] Invalid password shows safe error.
3. [ ] Sign out; `/account` redirects to staging login (not production).
4. [ ] Forgot password for a known staging user → email arrives; link host is staging only.
5. [ ] Open expired/used link → clear “Link expired” + request new link.
6. [ ] Set new password; old password fails; new password signs in.
7. [ ] Customer cannot call Admin APIs (403); Princess can (200).
8. [ ] After password change / allowlist note: fresh session if role/env changed.
9. [ ] Subjectively confirm login feels faster (no long hang before redirect).

---

# Stop condition

PR B implementation, validation, documentation, and PR-to-staging creation complete. **Do not start PR C. Do not merge to main. Do not promote production.**
