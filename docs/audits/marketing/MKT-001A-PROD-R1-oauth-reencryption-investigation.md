# MKT-001A-PROD-R1 — OAuth Re-encryption Failure Investigation

**Program:** Marketing Platform Remediation → production release
**Parent:** `docs/audits/marketing/MKT-001A-PROD-production-release-gate.md` (§3.1 operator smoke)
**Type:** Targeted production-gate remediation investigation — **does NOT reopen MKT-001A**
**Mode:** Read-only — code review + staging runtime logs + staging DB inspection. No code, env, deploy, or migration change performed.
**Owner:** Release operator (Google Cloud OAuth client + Vercel) + engineering reviewer
**Status:** 🔎 Investigation complete — root cause identified (high confidence); one operator confirmation step + a config remediation remain.
**Created:** 2026-07-16

---

## 0. Why this exists

The OPS-001 §9.4 / gate §3.1 operator smoke was executed on staging. Three of four checks passed; **OAuth Re-encryption FAILED**, which is a real release blocker (the independent `MARKETING_OAUTH_ENCRYPTION_KEY` + new encryption flow is a core MKT-001A objective).

| Check | Result | Impact |
|---|---|---|
| SSRF via Publish | ✅ PASS | complete |
| **OAuth Re-encryption** | ❌ **FAIL** | **release blocker** |
| Publish Idempotency | ✅ PASS | complete |
| Connected Accounts UI | ✅ PASS | complete |

Production stays **NO-GO**. This document answers: *where* it fails, *what* the error is, and *what* is causing it — before any remediation.

---

## 1. Evidence (read-only, 2026-07-16T23:32Z)

Deployment under test: `dpl_2vR3R1aHYmc2a1xCMAbGwaPKRgRy` (branch `staging` @ `d6a1bcad`). Evidence file: `docs/audits/marketing/evidence/mkt-001a-prod-r1-oauth-reencryption-2026-07-16T2332Z.json`.

- **Runtime logs (last 24h, staging):** exactly one relevant line —
  ```
  23:26:34 GET /api/oauth/google 200
    [gbp] oauth_start { redirectUri: 'https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/google/callback' }
  ```
  There is **no** subsequent `[gbp]` event: no `oauth_token_exchange_ok`, no `oauth_callback_failed`, no `oauth_state_mismatch`, no `oauth_denied`, no `save_connection_*`. The callback route `GET /api/oauth/google/callback` was **never invoked**.
- **Error logs (staging):** none for OAuth. The only error-level lines in the window are `[supabase] Admin client unavailable` from the **old** PR preview `dpl_2gAsyztv1ZZaDwCDq9ofYmXBmT3T` (`fix/mkt-001a-security-hardening`) — the known-unconfigured OPS-001 preview, unrelated to staging.
- **Staging database:** `social_accounts` is **empty (0 rows)** — no Google Business connection was ever persisted.

---

## 2. Flow map (Google Business OAuth — the only OAuth token that is stored/re-encrypted)

```text
GET /api/oauth/google            (admin-gated)
  → getGoogleOAuthConfig(): redirect_uri = GOOGLE_REDIRECT_URI ?? `${NEXT_PUBLIC_SITE_URL}/api/oauth/google/callback`
  → logs [gbp] oauth_start
  → 302 → Google authorize URL (accounts.google.com), redirect_uri = staging callback
            │
            ▼   ← FAILS HERE (before returning to the app)
Google authorize/consent  → should 302 back to redirect_uri with ?code&state
            │
            ▼   (never reached on staging)
GET /api/oauth/google/callback
  → validate state cookie → exchangeGoogleAuthorizationCode → saveGoogleBusinessConnection
  → encryptSecret() writes `v2:<keyId>:…` to social_accounts.access_token / refresh_token
```

Facebook has **no** OAuth callback route; `apps/web/app/api/oauth/**` contains only the Google routes, and Facebook publishing uses a static `FACEBOOK_PAGE_ACCESS_TOKEN`. So "OAuth re-encryption" applies to **Google Business only**.

---

## 3. Investigation answers

### 3.1 At which step does it fail?
At the **Google authorization / redirect step — before the callback.** `GET /api/oauth/google` logs `oauth_start` and 302s to Google; the browser never returns to `/api/oauth/google/callback`. Therefore the failure is **upstream of** token exchange, encryption, and the database write. (Encryption and re-encryption code is never reached.)

### 3.2 What is the exact error?
- **Application logs:** only `[gbp] oauth_start { redirectUri: '…git-staging….vercel.app/api/oauth/google/callback' }` — nothing after.
- **Provider response / browser:** not captured in our logs because the rejection happens on Google's domain. **Expected `Error 400: redirect_uri_mismatch`.** The definitive artifact must be captured by the operator (the Google error screen and/or the browser address bar at the point the flow stalls).
- **Server stack trace:** none — no exception was thrown in our functions (the callback did not run).

### 3.3 What is causing it?
| Candidate | Verdict | Why |
|---|---|---|
| The new encryption key | ❌ not the cause | Encryption never reached. `MARKETING_OAUTH_ENCRYPTION_KEY` **is present** on staging (`Preview (staging)` record). A successful connect would have encrypted fine. |
| Legacy token migration | ❌ not the cause | `social_accounts` is empty — there is no legacy/v1 token to decrypt or re-encrypt. |
| Google OAuth | ⚠️ implicated — at the **OAuth client config** layer | The staging callback URL is (almost certainly) not an **Authorized redirect URI** on the shared Google OAuth client. |
| Facebook OAuth | ❌ not applicable | No Facebook OAuth flow exists. |
| **Environment configuration** | ✅ **root cause (high confidence)** | `GOOGLE_REDIRECT_URI` is **Production-scoped only**; staging derives its `redirect_uri` from `NEXT_PUBLIC_SITE_URL` (`…git-staging….vercel.app/api/oauth/google/callback`) — a URL the Google client does not authorize → Google rejects the authorize request → no callback. |
| The implementation itself | ❌ not the cause | Initiate + callback + exchange + `encryptSecret` paths are correct; SSRF/idempotency/UI smokes passed; 62/62 unit tests incl. `tokenEncryption` 11. |

**Root cause (one sentence):** the staging Google Business OAuth redirect URI is not registered as an Authorized redirect URI on the shared Google OAuth client, so Google refuses the authorization request before the callback runs — the encryption key, legacy migration, Facebook, and the application code are **not** implicated.

---

## 4. Confirmation step (operator — do this first)

Re-run **Connect Google Business Profile** on the staging Connected Accounts page and capture either:
- the Google error page / browser address bar (expect `redirect_uri_mismatch`), **or**
- the Google Cloud OAuth client's **Authorized redirect URIs** list (confirm the staging callback URL is absent).

This converts the high-confidence diagnosis into a confirmed root cause.

---

## 5. Remediation direction (config only — no code change indicated)

1. Add `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/google/callback` to the Google OAuth client **Authorized redirect URIs** — **or** provision a dedicated staging Google OAuth **test client** and scope `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` to **Preview (staging)** (keeps staging separate from the production client, aligning with the gate §3.2 "separate from staging" goal).
2. Optionally set `GOOGLE_REDIRECT_URI` explicitly on the **Preview (staging)** scope so the redirect URI is deterministic rather than derived from `NEXT_PUBLIC_SITE_URL`.
3. Leave production `GOOGLE_REDIRECT_URI` (Production-only) **unchanged**.

**No application code change is indicated.** The encryption implementation and OAuth routes are correct.

---

## 6. Re-test (single failed check only)

After remediation, re-run **only** the OAuth re-encryption smoke on staging and confirm:
- Callback logs `[gbp] oauth_token_exchange_ok` → `[gbp] save_connection_ok`.
- `social_accounts` has a `google_business` row and its `access_token` / `refresh_token` are stored as the `v2:<currentKeyId>` envelope (safe check, no secret body):
  ```sql
  select provider, status, health,
         split_part(access_token, ':', 1)  || ':' || split_part(access_token, ':', 2)  as access_envelope,
         split_part(refresh_token, ':', 1) || ':' || split_part(refresh_token, ':', 2) as refresh_envelope
  from social_accounts;
  ```
- If a legacy (v1 / previous-key) row is intentionally seeded to exercise decrypt→re-encrypt, confirm it is upgraded to the current `keyId` on read (see `maybeReEncryptStoredTokens` in `apps/web/lib/google-business.ts`).

---

## 7. Status

- **Gate:** ⛔ **NO-GO** (unchanged). MKT-001A is **not** reopened.
- **Blocker:** MKT-001A-PROD-R1 — staging Google OAuth redirect URI not authorized (env/OAuth-client config).
- **Do not** merge `staging → main`, deploy to production, apply production migrations, or approve the release until this is remediated and the OAuth re-encryption smoke re-runs green on staging.
