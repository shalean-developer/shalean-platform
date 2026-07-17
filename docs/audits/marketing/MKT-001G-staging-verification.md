# MKT-001G — Staging Verification

**Program:** Marketing Platform Remediation  
**Phase:** MKT-001G — Meta Provider Production Readiness (staging verification)  
**Mode:** Controlled staging verification — **production untouched / unauthorized**  
**Source:** `docs/audits/marketing/MKT-001G-meta-provider-readiness.md`  
**Branch:** `feature/mkt-001g-meta-provider-readiness`  
**Base:** `staging` @ `1472c547` (fail-closed flags + release manifest)  
**Date:** 2026-07-17  

---

## 1. Executive decision

| Scope | Status |
|---|---|
| Implementation on feature branch | **COMPLETE** |
| Local engineering gates | **PASS** (see §3) |
| PR to `staging` | **OPEN** (see §2) |
| Post-merge exact-SHA staging deploy | **PENDING** |
| Provider staging smoke (Instagram connect + publish) | **OPERATOR / PENDING** |
| Facebook controlled-post production gate | **PENDING** (separate) |
| Full production authorization | **NOT GRANTED** |

---

## 2. Pull request

| Item | Value |
|---|---|
| Feature tip | `682a566e` |
| Commits vs staging | `c7adb24c`, `6bd69f63`, `55e09742`, `682a566e` |
| PR | https://github.com/shalean-developer/shalean-platform/pull/55 |
| Vercel preview (building) | `dpl_8UKstZ9dBi9P54py18JckAUb6Nri` (prior tip `55e09742`); tip `682a566e` docs commit will redeploy |

---

## 3. Local gate matrix (pre-merge)

| Gate | Status |
|---|---|
| Promotions vitest (`lib/promotions`) | **PASS** — 136/136 |
| Critical tests (`test:critical`) | **PASS** — 134/134 |
| Typecheck (`apps/web`) | **PASS** |
| Fail-closed defaults still present | **PASS** — inherited from staging `1472c547` |
| Instagram unit / contract tests | **PASS** — `mkt001gInstagram.test.ts` |
| Durable queue tests with FB flag | **PASS** — fixed for fail-closed defaults |

---

## 4. Provider-specific staging checklist (post-merge)

### Environment

```text
MARKETING_PROVIDER_FACEBOOK=1
MARKETING_PROVIDER_INSTAGRAM=1   # deliberate Instagram testing only
MARKETING_PROVIDER_GOOGLE_BUSINESS=0
```

### Migration

Apply on **staging** only:

`supabase/migrations/20260717180000_mkt_001g_instagram_ledger_provider.sql`

### Instagram gate smoke

| # | Control | Result |
|---|---|---|
| I1 | Professional account discovered | PENDING |
| I2 | Page linkage verified | PENDING |
| I3 | Permissions surfaced / approved | PENDING |
| I4 | Image container created | PENDING |
| I5 | Publish succeeds (public image URL) | PENDING |
| I6 | Media ID reconciled in history | PENDING |
| I7 | Data URL / unsupported media rejected pre-queue | PENDING |
| I8 | Retry does not duplicate media (idempotency) | PENDING |
| I9 | Flag-off shows intentionally disabled | PENDING |

### Facebook staging sanity (non-production)

| # | Control | Result |
|---|---|---|
| F-S1 | Flag-on Facebook still publishable on staging | PENDING |
| F-S2 | Fail-closed: unset FB flag blocks publish | PENDING (optional) |

### GBP

| Control | Result |
|---|---|
| Remains disabled / unset | **REQUIRED** |
| Does not block Meta staging work | **PASS** (governance) |

---

## 5. Auth model (locked)

**Facebook Login** only — Instagram Professional account linked to the configured Facebook Page. Do not mix Instagram Login.

Required scopes (typical): `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.

---

## 6. Deferred (not in this verification)

Carousels, Reels, Stories, video, product tagging, collaboration posts.

---

## 7. Production posture

**Unauthorized.** Do not promote to `main` / production until:

1. This staging verification closes PASS  
2. Facebook controlled-post production gate PASS  
3. Provider-release manifest entry filled  
4. Exact release SHA + Production env flags verified  
5. Rollback evidence recorded  
6. GBP remains disabled  

---

## Document control

| Field | Value |
|---|---|
| Status | **PRE-MERGE PASS / POST-MERGE PENDING** |
| Next | Merge PR after CI; apply migration; set staging flags; operator smoke; update this doc to PASS/FAIL |
