# MKT-001I — Instagram, X, and Google Business Profile Integration Completion

**Date:** 2026-07-18  
**Branch:** `fix/mkt-001i-social-provider-completion`  
**Target:** staging only  
**Production / `main`:** **NO-GO**

---

## 1. Executive decision

**CONDITIONAL PASS (staging workstream) / NO-GO (multi-provider completion & production).**

| Provider | Connect | Persist | Publish | Final |
| --- | --- | --- | --- | --- |
| Facebook | **PASS** | **PASS** | **PASS** | **PASS** |
| Instagram | BLOCKED | BLOCKED | BLOCKED | **NO-GO** |
| X | CODE READY | CODE READY | CODE READY | **NO-GO** (no staging credentials / dashboard session) |
| Google Business Profile | PRIOR PARTIAL | BLOCKED | BLOCKED | **NO-GO** |

Facebook’s existing PASS is retained with staging DB evidence (encrypted connection + real Page post). Instagram, X, and GBP are **not** marked PASS because a real staging connection **and** a real provider-side post were not completed for those providers in this session.

---

## 2. Facebook PASS evidence

Staging Supabase project `shalean-platform-staging` (`gbgnemlpyykyhpqqbgru`):

| Check | Evidence (redacted) |
| --- | --- |
| Connection row | `provider=facebook`, Page `102815532315418`, name `Shalean Cleaning Services`, `status=connected`, `health=healthy` |
| Connected by | `farai@shalean.com` @ `2026-07-18 07:55:50Z` |
| Token storage | `access_token` / `refresh_token` envelopes = **`encrypted_v2`** (ciphertext never inspected) |
| Expiry | `expires_at=2026-09-16` |
| Publish history | `status=published`, `response_id=102815532315418_1074436751809475`, `published_by=farai@shalean.com` @ `2026-07-18 07:56:37Z` |
| Idempotency ledger | `provider=facebook`, `status=succeeded`, same `external_post_id` |

Implied OAuth stages (from persisted outcome + prior H.6.3 Meta/staging config):

1. Authorization code received (callback progressed past `missing_code`)
2. Token exchange succeeded (Page token present)
3. Page discovery succeeded (Page ID + name persisted)
4. Encrypted connection persistence succeeded (`v2:` envelopes)
5. Publishing returned provider post ID `…9475`

Page ID matches intended Page `102815532315418`. Runtime log pull for the latest deploy returned empty (retention / observability gap); DB rows are the durable PASS evidence.

---

## 3. Instagram account / linkage state

| Check | Result |
| --- | --- |
| Architecture preference | **Reuse Facebook Page token** (`authModel=facebook_login`); dedicated LfB config `…1441` only when Connect Instagram starts purpose OAuth |
| Staging LfB config | Instagram Graph API / User token / masked ID **`…1441`** (from H.6.3) |
| Business Instagram assets | Meta Business Suite → Instagram accounts: **“No Instagram accounts added”** |
| Page linked IG | Not confirmable — Business Suite **“Verification needed” → Verify account** modal blocks Connect assets / asset inspection (operator 2FA / identity) |
| `social_accounts` Instagram row | **Absent** |
| Code correction needed | **None** for discovery architecture; existing Page-linked discovery path is correct |

---

## 4. Instagram publishing result

**Not run.** No Instagram Professional account is present as a Business asset, and Meta account verification blocks further asset linking. One discovery/publish attempt was intentionally deferred until linkage is proven (avoids useless Graph retries).

---

## 5. X current architecture (pre → post this branch)

| Area | Before | After (this branch) |
| --- | --- | --- |
| Auth | Stub only | **OAuth 2.0 Authorization Code + PKCE (S256)** |
| Routes | None | `/api/oauth/x`, `/api/oauth/x/callback`, `/api/admin/promotions/publish-x` |
| Adapter | `createStubProvider({ key: "x" })` | `createXProvider()` |
| Persist | Unused `twitter` CHECK | Encrypted `social_accounts.provider='twitter'` mapped to registry key `x` |
| Publish | N/A | `POST https://api.x.com/2/tweets` text-only |
| Ledger | No `x` | Migration widens ledger/jobs CHECK to include `x` |
| UI | Copy-only stub card | Connect / Disconnect X on Connected Accounts |

First incomplete point before this work: **no OAuth implementation** (registry stub + campaign copy only).

Security audit of new code: random state, PKCE verifier in HttpOnly cookie, S256 challenge, encrypted tokens, refresh path, revoke on disconnect, redacted `[x-oauth]` logs, fail-closed `MARKETING_PROVIDER_X`, connection requires encrypted token + `status=connected` (not row presence alone).

---

## 6. X dashboard and access state

| Item | Result |
| --- | --- |
| Browser session to developer.x.com | **Not authenticated** (redirected to X login) |
| Client ID / callback registration | **Not configured** this session |
| Staging env `X_CLIENT_*` | **Unknown / not set via agent** (Vercel CLI scoped to personal account; team env write unavailable) |
| API product / paid tier | **Unknown** — stop before purchase |

---

## 7. X OAuth result

**Not run** — blocked on X Developer login + staging Client ID/Secret/Redirect URI.

Exact staging callback to register when credentials exist:

`https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/x/callback`

(or the staging custom domain equivalent if that is the canonical `X_REDIRECT_URI`).

Scopes: `tweet.read tweet.write users.read offline.access`.

---

## 8. X publishing result

**Not run** — depends on §7.

---

## 9. Google Cloud project / API state

| Item | Result |
| --- | --- |
| Prior root cause (MKT-001A-PROD-R2) | After token exchange, `list_accounts` → **403 API not enabled** on project **`525459256770`** |
| Browser re-audit this session | Google Cloud Console → **Sign-in required** (no authenticated session) |
| Reconfirm APIs enabled | **Blocked** on Google login |
| Quota / GBP approval | **Unknown** until APIs page is readable |

Operator must sign into Cloud project `525459256770` and enable (as applicable):

1. My Business Account Management API  
2. My Business Business Information API  
3. Google My Business API (Local Posts / v4)

If quota is zero / access-not-approved: submit Google’s GBP API access request for that project — **do not** code around it.

---

## 10. Google OAuth result

**Not retested** this session. Prior staging evidence remains: token exchange **OK**, account discovery **403**.

---

## 11. GBP account / location discovery result

**Not retested.** Prior: discovery failed before encrypt/persist; no `google_business` row expected until APIs are enabled.

---

## 12. GBP publishing result

**Not run.**

---

## 13. Security and token-storage review

| Control | Facebook | Instagram | X | GBP |
| --- | --- | --- | --- | --- |
| Normalized adapter | Yes | Yes | Yes (new) | Yes |
| Encrypted tokens (`v2:`) | Proven | Same path | Implemented | Implemented |
| State / CSRF | Yes | Via FB OAuth | Yes | Yes |
| PKCE | N/A (Meta) | N/A | Yes | N/A |
| Idempotent publish | Yes | Yes | Yes (`x` ledger) | Yes |
| Retry taxonomy | Yes | Yes | Yes | Yes |
| No auto-retry on auth/permission | Yes | Yes | Yes | Yes |
| Redacted logs | Yes | Yes | Yes | Yes |
| Feature flags fail-closed | Yes | Yes | Yes | Yes |
| Connected ≠ row-only | Yes | Yes | Yes | Yes |

No large framework rewrite performed.

---

## 14. Tests and build evidence

Focused Vitest (pass):

```text
npx vitest run lib/oauth/__tests__/xOAuth.test.ts \
  lib/promotions/__tests__/mkt001iXPublish.test.ts \
  lib/promotions/__tests__/mkt001gInstagram.test.ts \
  lib/oauth/__tests__/metaFacebookOAuth.test.ts \
  lib/promotions/providers/__tests__/registry.test.ts
→ 5 files / 59 tests passed
```

Typecheck: fixed `publish-x` `runPublish` args; re-run required on PR CI.

Migration applied on staging Supabase: `mkt_001i_x_ledger_provider` (ledger/jobs allow `x`).

---

## 15. Environment and deployment evidence

| Item | Value |
| --- | --- |
| Staging SHA (pre-PR baseline) | `7c79a066` |
| Staging deploy | `dpl_EhpJnyYeSZnEBnMdtf49kkFioTMC` READY |
| FB LfB config | `…7795` |
| IG LfB config | `…1441` |
| This branch | `fix/mkt-001i-social-provider-completion` (PR to staging; do not merge to main) |

Required staging env for X (Preview only):

```text
X_CLIENT_ID=<from X developer portal>
X_CLIENT_SECRET=<from X developer portal>
X_REDIRECT_URI=<exact staging callback>
MARKETING_PROVIDER_X=1   # only after connect smoke planned
```

---

## 16. Remaining external blockers

1. **Instagram:** Meta Business Suite account verification (password / 2FA / identity) + add Professional IG to business + link to Page `102815532315418`.
2. **X:** Operator login to X Developer Portal; create/configure OAuth 2.0 app; set staging callback; provide Client ID/Secret to Vercel Preview; enable `MARKETING_PROVIDER_X` after redeploy; connect + one text post. Stop if paid API tier is required.
3. **Google:** Operator login to Cloud project `525459256770`; enable My Business APIs; confirm OAuth client + staging redirect; retest Connect → location select → local post. Stop if formal GBP API approval is required.
4. **Vercel team env:** Agent Vercel CLI is on personal scope; staging env writes need team-authenticated CLI or dashboard.

---

## 17. Production migration / release requirements

- **Do not** merge to `main` or deploy production.
- When IG/X/GBP each have staging Connect + Publish PASS:
  - Production Meta / X / Google apps and redirect URIs
  - Production-only encryption key posture
  - Per-provider `MARKETING_PROVIDER_*=1` with release manifest entries
  - Explicit release approval

---

## 18. Final provider matrix

| Provider | Connect | Persist | Publish | Final |
| --- | --- | --- | --- | --- |
| Facebook | PASS | PASS | PASS | **PASS** |
| Instagram | NO-GO | NO-GO | NO-GO | **NO-GO** |
| X | NO-GO* | NO-GO* | NO-GO* | **NO-GO** |
| Google Business Profile | NO-GO | NO-GO | NO-GO | **NO-GO** |

\*Code and tests for OAuth PKCE + text publish are on this branch; runtime PASS pending credentials and one staging smoke.

**Overall:** CONDITIONAL PASS for Facebook retention + X code delivery; **NO-GO** for declaring Instagram / X / GBP complete; **production / main remain NO-GO**.
