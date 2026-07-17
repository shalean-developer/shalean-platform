# MKT-001G — Staging Verification

**Program:** Marketing Platform Remediation  
**Phase:** MKT-001G — Meta Provider Production Readiness (staging verification)  
**Mode:** Controlled staging verification — **production untouched / unauthorized**  
**Source:** `docs/audits/marketing/MKT-001G-meta-provider-readiness.md`  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/55  
**Date:** 2026-07-17  

---

## 1. Executive decision

**CONDITIONAL / INCOMPLETE** for staging close-out.

PR #55 is merged into `staging`, the Instagram ledger migration is applied on staging Supabase, provider flags are set deliberately, and an exact-SHA redeploy is **READY** with healthy environment identity. Instagram operator smoke **I1–I9** and Facebook regression smoke remain **pending** (require an authorized staging admin session + Page-linked Instagram Professional account).

**This document is not PASS.** Production remains **NO-GO**. Do not authorize production from pre-merge or post-merge deploy integrity alone.

---

## 2. Gate matrix (current)

| Gate | Status |
|---|---|
| Implementation | **PASS** |
| Pre-merge local tests | **PASS** |
| PR #55 merge | **PASS** — `b692b4dc6dd77b45d23f94bfa5ee762979e9f616` @ `2026-07-17T15:51:15Z` |
| CI product gates | **PASS** — critical, revenue-path, typecheck, migration governance, GitGuardian, Vercel |
| Live internal link crawl (`vitest` job) | **RED (unrelated)** — OPS-CI-001 / issue #49 |
| Staging migration | **PASS** — `mkt_001g_instagram_ledger_provider` on `gbgnemlpyykyhpqqbgru` |
| Provider flags (Preview / `staging`) | **PASS** — FB=1, IG=1, GBP=0 |
| Exact-SHA staging deployment | **PASS** — `dpl_AtCM1tpr1TcDcrkdRuJWEbzkSZpX` @ merge SHA |
| Staging `/api/health/environment` | **PASS** — `deployment=staging`, `gitBranch=staging`, `issues:[]` |
| Instagram operator smoke I1–I9 | **OPERATOR / PENDING** |
| Facebook regression smoke | **OPERATOR / PENDING** |
| Marketing runtime errors / queue-DLQ review | **PASS (baseline)** — see §7 |
| MKT-001G final staging decision | **CONDITIONAL / INCOMPLETE** |
| Production | **NO-GO** |

---

## 3. Pull request / merge

| Item | Value |
|---|---|
| Feature branch | `feature/mkt-001g-meta-provider-readiness` |
| PR | https://github.com/shalean-developer/shalean-platform/pull/55 |
| Merged at | `2026-07-17T15:51:15Z` |
| Merge commit (exact) | `b692b4dc6dd77b45d23f94bfa5ee762979e9f616` |
| Base | `staging` |
| Feature tip before merge | `752cb1662b97f8a8abb1664e0da9146517200a38` |

### CI note (vitest RED)

`web-test` / `vitest` failed only at **Live internal link crawl** against production `https://shalean.co.za` (10 pre-existing `/locations/*` 404s). All earlier steps on the same run **PASS**. Classification: **OPS-CI-001** / [issue #49](https://github.com/shalean-developer/shalean-platform/issues/49) — same as MKT-001C/D/E/F. Staging is not under the `main` required-checks ruleset; crawl was not weakened.

---

## 4. Staging migration

Applied **staging only** (`gbgnemlpyykyhpqqbgru`):

| Item | Value |
|---|---|
| Repo file | `supabase/migrations/20260717180000_mkt_001g_instagram_ledger_provider.sql` |
| Remote name | `mkt_001g_instagram_ledger_provider` |
| Remote version | `20260717155135` |
| `marketing_publish_idempotency` provider CHECK | `facebook \| google_business \| instagram` |
| `social_publish_jobs` provider CHECK | `facebook \| google_business \| instagram` |
| Production Supabase | **Untouched** |

---

## 5. Provider flags (deliberate staging)

Configured on **Vercel Preview**, git branch **`staging` only** (non-sensitive):

```text
MARKETING_PROVIDER_FACEBOOK=1
MARKETING_PROVIDER_INSTAGRAM=1
MARKETING_PROVIDER_GOOGLE_BUSINESS=0
```

Production env scope was **not** modified.

---

## 6. Exact-SHA deployment + health

| Item | Value |
|---|---|
| Merge deploy | `dpl_C9fGbGnfDyqsY2RvprP6dd2mrg3Y` (post-merge git) |
| Env-aware redeploy | `dpl_AtCM1tpr1TcDcrkdRuJWEbzkSZpX` (**authoritative**) |
| Deployment SHA | `b692b4dc6dd77b45d23f94bfa5ee762979e9f616` (**exact match**) |
| Ready state | **READY** |
| Staging alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Inspector | https://vercel.com/shalean-cleaning-services/shalean-platform/AtCM1tpr1TcDcrkdRuJWEbzkSZpX |
| `main` / production | **Untouched** — merge SHA is **not** an ancestor of `origin/main` (`ad5b4ccb`) |

### Health evidence (`GET /api/health/environment`)

```json
{
  "status": "ok",
  "service": "shalean-environment",
  "timestamp": "2026-07-17T16:03:05.108Z",
  "deployment": "staging",
  "vercelEnv": "preview",
  "gitBranch": "staging",
  "shaleanAppEnv": "staging",
  "supabase": {
    "configuredRef": "gbgnemlpyykyhpqqbgru",
    "expectedRef": "gbgnemlpyykyhpqqbgru",
    "urlHost": "gbgnemlpyykyhpqqbgru.supabase.co"
  },
  "issues": []
}
```

Access: temporary `_vercel_share` Deployment Protection bypass (auto-expires).

---

## 7. Runtime errors + queue / DLQ

| Check | Result |
|---|---|
| Runtime error/fatal logs on redeploy (`dpl_AtCM1t…`, 6h) | **0** |
| Jobs `queued` / `leased` | **0** |
| Instagram jobs | **none** (expected pre-connect) |
| Facebook job counts | succeeded 2 / retryable 1 / dead_letter 4 |
| DLQ / retryable content | Pre-existing MKT-001B.2 smoke — expired FB session tokens + one ledger-conflict retryable; **not** introduced by MKT-001G |
| `social_accounts` facebook/instagram rows | **0** — connect not yet performed |

Evidence: `docs/audits/marketing/evidence/mkt-001g-staging-postmerge-2026-07-17T1605Z.json`

---

## 8. Operator blockers (not engineering defects)

The remaining work is an **operator-access and test-fixture** prerequisite. It is **not** an implementation, migration, flag, or deploy defect.

Required before I1–I9 and Facebook regression can run:

1. Authenticated staging admin session (SSO + admin role)
2. Facebook Page connection on staging
3. Linked Instagram Professional account (via Facebook Login / Page linkage)
4. Controlled publish asset (public image URL suitable for IG single-image publish)

Until those are available and smoke evidence is attached, **PASS is not authorized**. Keep the final staging decision at **CONDITIONAL / INCOMPLETE**.

---

## 9. Provider-specific staging checklist (operator)

### Auth model (locked)

**Facebook Login** only — Instagram Professional account linked to the configured Facebook Page. Do not mix Instagram Login.

Required scopes (typical): `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.

### Instagram gate smoke

| # | Control | Result |
|---|---|---|
| I1 | Professional account discovered | **OPERATOR / PENDING** |
| I2 | Page linkage verified | **OPERATOR / PENDING** |
| I3 | Permissions surfaced / approved | **OPERATOR / PENDING** |
| I4 | Encrypted account/token persistence | **OPERATOR / PENDING** |
| I5 | Single-image container creation | **OPERATOR / PENDING** |
| I6 | Container status handling | **OPERATOR / PENDING** |
| I7 | Final publish (public image URL) | **OPERATOR / PENDING** |
| I8 | Ledger/history reconciliation + idempotent retry | **OPERATOR / PENDING** |
| I9 | Duplicate prevention / safe error recovery (+ flag-off disabled UX if retested) | **OPERATOR / PENDING** |

Agent probe: `GET /api/admin/promotions/publish-instagram` → **401 Missing authorization** (Deployment Protection bypassed; admin session required).

### Facebook staging sanity (non-production)

| # | Control | Result |
|---|---|---|
| F-S1 | Flag-on Facebook still publishable on staging after flag changes | **OPERATOR / PENDING** |
| F-S2 | Fail-closed: unset FB flag blocks publish | OPTIONAL / PENDING |

### GBP

| Control | Result |
|---|---|
| Remains disabled (`MARKETING_PROVIDER_GOOGLE_BUSINESS=0`) | **PASS** (env configured) |
| Does not block Meta staging work | **PASS** (governance) |

---

## 10. Deferred (not in this verification)

Carousels, Reels, Stories, video, product tagging, collaboration posts.

---

## 11. Production posture

**Unauthorized.** Do not promote to `main` / production until:

1. This staging verification closes **PASS** (operator I1–I9 + Facebook regression recorded)  
2. Facebook controlled-post production gate PASS  
3. Provider-release manifest entry filled  
4. Exact release SHA + Production env flags verified  
5. Rollback evidence recorded  
6. GBP remains disabled  

---

## Document control

| Field | Value |
|---|---|
| Status | **CONDITIONAL / INCOMPLETE** — deploy + migration + flags PASS; operator Instagram/Facebook smoke pending |
| Evidence | `docs/audits/marketing/evidence/mkt-001g-staging-postmerge-2026-07-17T1605Z.json` |
| Next | Operator runs I1–I9 + F-S1 on staging alias with admin session; return evidence; then update this doc to **PASS** or **FAIL** |
| Production | **NO-GO** |
