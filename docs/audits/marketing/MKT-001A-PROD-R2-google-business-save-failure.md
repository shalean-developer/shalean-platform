# MKT-001A-PROD-R2 — Google Business Profile Save Failure Deep Scan and Remediation

**Project:** Shalean Cleaning Services
**Area:** Marketing Platform → Connected Accounts → Google Business Profile
**Date:** 2026-07-17
**Branch:** `fix/mkt-001a-google-business-save-failure` (from `staging`)
**Release status:** Production **NO-GO** — no merge to `main`, no production migration, no production deploy.
**Evidence:** `docs/audits/marketing/evidence/mkt-001a-prod-r2-google-business-save-failure-2026-07-17T0640Z.json`

---

## 1. Executive decision

**CONDITIONAL PASS (code) / NO-GO (release).**

The exact failure stage is proven: after a **successful** OAuth token exchange, Google Business
**account discovery** fails with `403 — API not enabled` (then `429` on rapid retries). The save path
returns before token encryption and before the `social_accounts` write, so nothing is persisted and the
UI shows the generic *"Connected to Google but saving the account failed."*

- **Primary root cause is configuration-only:** the Business Profile APIs are **disabled** on the
  OAuth client's Google Cloud project (`525459256770`). This requires an **operator action** in Google
  Cloud; no application behaviour change fixes it.
- **Secondary, confirmed code defect (diagnosability):** the callback collapsed *every* post-exchange
  failure into a single opaque `save_failed`, and the UI discarded the provider detail. This is fixed
  here with a **minimal, sanitized** error classifier + actionable UI message (no behaviour change to
  discovery/encryption/persistence).

Release remains **NO-GO** until the operator enables the APIs, staging OAuth reaches
`save_connection_ok` with a `v2:` `google_business` row, and the outstanding R1 item
(`MARKETING_OAUTH_ENCRYPTION_KEY` re-scope to **Production-only**) is closed.

---

## 2. Repository state

```
branch (base):  staging @ 865bda57 → new branch: fix/mkt-001a-google-business-save-failure
controls:       PR #40 docs-only branch untouched; production untouched; no migrations applied
```

Changes are isolated to the Google Business connect diagnostics (see §8). No unrelated marketing
features; MKT-001B not started.

---

## 3. Reproduction timeline (staging)

| Time (UTC) | Stage | Evidence | Result |
| ---------- | ----- | -------- | ------ |
| T0 | `oauth_start` | `[gbp] oauth_start` | ✅ redirect to Google |
| T1 | `oauth_callback` | state validated | ✅ CSRF match |
| T2 | `token_exchange` | `[gbp] oauth_token_exchange_ok` | ✅ access + refresh token |
| T3 | `list_accounts` | `[gbp] list_accounts_failed { status: 403 }` → `{ status: 429 }` | ❌ **API not enabled**, then rate-limited |
| T4 | `list_locations` | — | ⛔ not reached |
| T5 | `encrypt` | — | ⛔ not reached |
| T6 | `social_accounts` upsert | — | ⛔ not reached |
| T7 | `oauth_save_failed` | `[gbp] oauth_save_failed` | redirect `?error=save_failed` |
| T8 | UI render | `ERROR_MESSAGES.save_failed` | generic message, detail discarded |

**Staging DB:** `select ... from public.social_accounts` → **`[]`** (no `google_business` row; `v2` token
persistence not proven). 429s were **not** retried aggressively (provider backoff respected).

---

## 4. Call graph

```
ConnectedAccountsPanel.connectGoogle()
→ GET /api/oauth/google                         (route.ts: getGoogleOAuthConfig, buildGoogleBusinessAuthUrl, set CSRF cookie)
→ Google authorization (scope=business.manage, access_type=offline, prompt=consent)
→ GET /api/oauth/google/callback                (callback/route.ts)
    → exchangeGoogleAuthorizationCode()          ✅ oauth_token_exchange_ok
    → saveGoogleBusinessConnection()             (google-business.ts L480)
        → listAllGoogleBusinessLocations()       (L260)
            → listGoogleBusinessAccounts()       (L181)
                → googleFetch(/accounts)         (L144) → 403 → formatGoogleBusinessError() (L85)
            → returns { ok:false, error }        ❌ list_accounts_failed
        → `if (!listed.ok) return listed`        (L498–499)  ⟵ RETURNS BEFORE encrypt (L522) / upsert (L540)
    → `!saved.ok` → redirect ?error=save_failed  (callback) → [gbp] oauth_save_failed
→ /office/marketing/connected-accounts?error=save_failed
→ ERROR_MESSAGES[save_failed] → generic toast    ⟵ provider detail discarded (diagnosability defect)
```

Key point: **encryption and the DB write are never reached** in this failure — the exact failure stage
is Google **account discovery** (`list_accounts`).

---

## 5. Root-cause matrix

| Candidate | Evidence for | Evidence against | Decision |
| --------- | ------------ | ---------------- | -------- |
| Disabled Google APIs | 403 body: "API has not been used in project 525459256770 … is disabled" | none | **PRIMARY (confirmed)** |
| Missing API access approval | Same family as disabled/quota; needs GCP confirmation | — | Contributing (operator to confirm) |
| Rate limit (429) | 429 seen after rapid reconnects | 403 precedes it | Secondary (masks 403) |
| Wrong OAuth scopes | — | `business.manage` covers account+location+local posts | Ruled out |
| Redirect mismatch | — | Token exchange succeeded ⇒ redirect_uri matched | Ruled out |
| No Business Profile account | Unverifiable until APIs enabled | Zero-account path persists `pending_location`, not `save_failed` | Not the cause of this failure |
| Location discovery bug | — | Discovery fails before location loop | Ruled out |
| Encryption failure | — | Not reached (returns at L499) | Ruled out |
| DB/RLS/constraint failure | — | Not reached (no upsert) | Ruled out |
| UI hides provider error | Callback sent no reason; UI showed generic copy | — | **Secondary (confirmed) — fixed here** |

---

## 6. Primary root cause

**Google Business Profile APIs are disabled on the OAuth client's Google Cloud project
(`525459256770`).** The connect succeeds through token exchange, then the first Business Profile call
(`GET .../accounts`) returns `403 accessNotConfigured / SERVICE_DISABLED`. This is **configuration**,
not code.

## 7. Secondary findings

1. **Diagnosability defect (code):** all post-exchange failures (API disabled, rate limit, permission,
   no Business Profile, revoked token, transient outage, real save error) were reported to the operator
   as one opaque `save_failed`, and the UI discarded the `detail`. Operators could not tell a
   configuration problem from a genuine save/encryption error.
2. **Rate-limit masking (operational):** rapid reconnect attempts turned the deterministic 403 into a
   429, obscuring the real cause. Respect provider backoff between attempts.

---

## 8. Changes made

Smallest safe fix — **diagnosability only**; discovery/encryption/persistence behaviour is unchanged.

| Change | Type | File | Result |
| ------ | ---- | ---- | ------ |
| New pure error classifier + sanitized reason→message map | add | `apps/web/lib/oauth/googleBusinessSaveError.ts` | Maps provider/save errors to `api_disabled`/`rate_limited`/`permission_denied`/`no_business_profile`/`token_revoked`/`provider_unavailable`/`save_failed`; never echoes raw text/IDs/URLs/tokens |
| Attach sanitized `reason` on callback redirect; drop raw `detail` from browser URL; keep full error in server log | edit | `apps/web/app/api/oauth/google/callback/route.ts` | Browser no longer receives project number / raw provider body; server retains full error for ops |
| Render actionable, sanitized message from `reason` (generic fallback preserved) | edit | `apps/web/components/admin/promotions/ConnectedAccountsPanel.tsx` | e.g. "…the Business Profile API is disabled for this Google Cloud project. An operator must enable the Business Profile APIs, then reconnect." |
| Unit tests incl. malicious/unexpected inputs | add | `apps/web/lib/oauth/__tests__/googleBusinessSaveError.test.ts` | 9 tests, all pass |

**Not done (deliberately, to keep the fix minimal / avoid behaviour change):** no token persistence when
discovery is unavailable; no broad retries; no relaxation of account/location validation.

---

## 9. Google Cloud / operator actions (required for GO)

In GCP project **`525459256770`** (the project owning the OAuth client), enable and confirm access:

- `mybusinessaccountmanagement.googleapis.com` — My Business Account Management API
- `mybusinessbusinessinformation.googleapis.com` — My Business Business Information API
- `mybusiness.googleapis.com` — Google My Business API (v4, Local Posts)

Then: confirm quota/access approval, allow propagation, and **avoid rapid reconnect** (so 429 does not
mask the result). Re-run the staging OAuth smoke once.

Still outstanding from **R1**: re-scope `MARKETING_OAUTH_ENCRYPTION_KEY` from `Preview + Production` to
**Production-only**, with operator attestation it is not reused from staging / `GOOGLE_CLIENT_SECRET` /
Supabase keys / any other secret.

---

## 10. Tests

| Gate | Result |
| ---- | ------ |
| `googleBusinessSaveError` unit tests | ✅ 9/9 |
| `typecheck` | ✅ PASS |
| `eslint` (changed files) | ✅ 0 errors (2 pre-existing warnings on untouched lines) |
| `test:critical` | ✅ 134/134 |
| `test` (full) | ✅ 3445/3445 (539 files) |
| `db:migrations:validate` | ✅ 14 files; both MKT-001A migrations present, untouched |
| `build` (webpack) | ✅ 243/243 pages compiled |
| `build` (turbopack) | ⚠️ fails locally on Windows junction resolution of `@shalean/*` workspace packages (environmental; same path resolution as the passing `typecheck`; CI/Linux builds normally) |

---

## 11. Staging verification

| Gate | Result | Evidence |
| ---- | ------ | -------- |
| `oauth_token_exchange_ok` | ✅ | staging logs |
| `list_accounts_ok` | ❌ | 403 API disabled → 429 |
| `list_locations_ok` | ⛔ not reached | — |
| `save_connection_ok` | ⛔ not reached | — |
| `google_business` row exists | ❌ | `social_accounts` = `[]` |
| token envelope `v2:` | ⛔ unproven | no row |

Full end-to-end verification is **blocked on the operator** enabling the Google APIs (and on an
authenticated admin reconnect). Not achievable from tooling in this environment.

---

## 12. Remaining risks

| Risk | Severity | Blocking |
| ---- | -------- | -------: |
| Business Profile APIs still disabled on `525459256770` | High | Yes |
| 429 masks 403 if operator retries too fast | Medium | Yes (verification) |
| `MARKETING_OAUTH_ENCRYPTION_KEY` still `Preview + Production` (R1) | High | Yes |
| Ownership: connected Google account may not manage a Business Profile | Medium | Verify after enablement |

---

## 13. Production gate impact

**NO-GO.** The encryption objective (v2 envelope persisted after `save_connection_ok`) is still unproven
in staging, and the key-scope item from R1 is open. The code fix improves operator diagnosability but
does not, by itself, unblock the release.

---

## 14. Final GO / NO-GO recommendation

**NO-GO** until, in order:

1. Operator enables the three Business Profile APIs in project `525459256770` and confirms access/quota.
2. Staging OAuth smoke reaches `oauth_token_exchange_ok → list_accounts_ok → list_locations_ok →
   save_connection_ok`, one `google_business` row exists, and `access_token` (and `refresh_token` when
   present) begin with `v2:` (record format/row-count only, never token values).
3. `MARKETING_OAUTH_ENCRYPTION_KEY` re-scoped to **Production-only** with operator attestation.

Then follow the governed sequence (merge this fix PR → `staging`; final gate re-verification; PR #40
`staging → main`; production identity check; apply the two MKT-001A migrations; deploy; verify; close).

---

### Next authorized action

Open a PR from `fix/mkt-001a-google-business-save-failure` into `staging` for the diagnostics fix, and
hand the Google Cloud API enablement + key re-scope to the operator. Do **not** merge to `main`, apply
production migrations, or deploy production without a new explicit GO.
