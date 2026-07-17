# MKT-001F — Staging Verification

**Program:** Marketing Platform Remediation  
**Phase:** MKT-001F — Marketing UX Polish (staging verification)  
**Mode:** Controlled staging verification — **production untouched**  
**Source:** `docs/audits/marketing/MKT-001F-marketing-ux-polish.md`  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/52  
**Date:** 2026-07-17  

---

## 1. Executive decision

**PASS** for staging.

MKT-001F is merged into `staging`, deployed at the exact merge SHA, and verified for deployment integrity, product-gate regression safety, and staging environment health. Preview-only operator UX smoke is **not** treated as merge evidence; this document records repository and deployment evidence after merge.

**Production remains NO-GO.** `staging → main` stays blocked while MKT-001A-PROD is open.

---

## 2. Status before this close-out (corrected)

| Gate | Status (pre-merge) |
|---|---|
| Implementation | Complete |
| Preview operator UX smoke | PASS (non-authoritative for merge) |
| PR #52 | OPEN → **MERGED** |
| Required product CI gates | PASS |
| Live internal link crawl (`vitest` job) | FAIL — OPS-CI-001 only |
| Merge to `staging` | Pending → **PASS** |
| Exact-SHA staging deployment | Pending → **PASS** |
| MKT-001F staging verification | CONDITIONAL / INCOMPLETE → **PASS** |
| Production | **NO-GO** |

---

## 3. Staging gate matrix

| Gate | Status |
|---|---|
| CI investigation (no MKT-001F defect) | **PASS** — see §4 |
| Local focused MKT + A–E/B.2 suites | **PASS** (78/78) |
| Typecheck (`apps/web`) | **PASS** |
| Critical tests | **PASS** (134) |
| Vercel preview build (feature SHA) | **PASS** (`dpl_F6PpTK7h`, READY, `327c9f76`) |
| PR #52 merged into `staging` | **PASS** |
| Exact staging SHA `9c1f0d3b` deployed | **PASS** |
| Staging deployment READY | **PASS** (`dpl_C5ARRsNDU5k4oGndcksXiopsAvbq`) |
| Staging `/api/health/environment` | **PASS** (`deployment=staging`, `gitBranch=staging`) |
| Runtime error scan (marketing routes, 2h) | **PASS** (0 errors) |
| `main` / production untouched | **PASS** — `9c1f0d3b` is **not** an ancestor of `origin/main` (`ad5b4ccb`) |
| Admin-authenticated marketing UI matrix | **OPERATOR** (Vercel SSO + admin session) — prior preview smoke PASS; post-merge deploy integrity confirmed |
| Live internal link crawl (CI) | **RED (unrelated)** — OPS-CI-001 / issue #49 production `/locations/*` 404s |

---

## 4. CI investigation (vitest RED)

**Finding:** No MKT-001F unit-test or implementation defect.

The `web-test` / `vitest` job failed only at **Live internal link crawl** against production (`https://shalean.co.za`): ten pre-existing `/locations/*` HTTP 404s.

All earlier job steps on the same run **PASS**, including critical tests, revenue-path tests, typecheck, booking-core ESLint, live SEO validation, migration governance, GitGuardian, and Vercel preview.

**Classification:** OPS-CI-001 / GitHub issue #49. Same classification as MKT-001C/D/E merges (including PR #50). The crawl was **not** weakened or bypassed.

Evidence comment: https://github.com/shalean-developer/shalean-platform/pull/52#issuecomment-5003218281

---

## 5. Deployment traceability

| Item | Value |
|---|---|
| Feature branch | `feature/mkt-001f-marketing-ux-polish` |
| Feature commit | `327c9f76b449a1fd7ae42daf137f078905e33dd8` |
| PR | https://github.com/shalean-developer/shalean-platform/pull/52 |
| Merge commit (staging tip) | `9c1f0d3be07c805239ebfce2c2a5c4bfe7a7ebb7` |
| Vercel deployment | `dpl_C5ARRsNDU5k4oGndcksXiopsAvbq` |
| Deployment SHA | `9c1f0d3be07c805239ebfce2c2a5c4bfe7a7ebb7` (**exact match**) |
| Ready state | **READY** |
| Staging branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Deployment URL | `https://shalean-platform-ynl0irfc5-shalean-cleaning-services.vercel.app` |
| Inspector | `https://vercel.com/shalean-cleaning-services/shalean-platform/C5ARRsNDU5k4oGndcksXiopsAvbq` |
| Production / `main` | **Untouched** — merge SHA is not an ancestor of `origin/main` |

### Health evidence (staging alias, authenticated MCP fetch)

```json
{
  "status": "ok",
  "service": "shalean-environment",
  "deployment": "staging",
  "vercelEnv": "preview",
  "gitBranch": "staging",
  "shaleanAppEnv": "staging",
  "issues": []
}
```

Timestamp: `2026-07-17T12:32:10.195Z`

---

## 6. Staging verification matrix (post exact-SHA deploy)

| Scenario | Expected result | Status |
|---|---|---|
| Exact SHA on staging alias | Deploy READY at `9c1f0d3b` | **PASS** |
| Environment health | `deployment=staging`, `gitBranch=staging` | **PASS** |
| Marketing runtime errors (2h) | No new clusters on marketing routes | **PASS** (0) |
| No connected / stub / disabled providers | Accurate unavailable UX; no false publish | **OPERATOR** (preview smoke + code gates; admin SSO) |
| Healthy provider | Accurate status and actions | **OPERATOR** |
| Expired / degraded | Reconnect guidance | **OPERATOR** |
| Social success / failure | Toast, history, correlation guidance | **OPERATOR** + unit coverage |
| Duplicate publish click | One logical publish | **PASS** (unit `canInvokePublish`) |
| Campaign draft unsaved warning | Content preserved / beforeunload | **PASS** (unit + implementation) |
| Empty analytics / zero sample | Em-dash, not misleading % | **PASS** (unit `formatSafePercent` / `formatSafeRoi`) |
| Intelligence severity / evidence | Severity text + runbook | **OPERATOR** + prior MKT-001E |
| Mobile / keyboard / a11y | No overflow; labeled controls | **OPERATOR** (preview) + code review |
| Sensitive data | No tokens / raw payloads | **PASS** (architecture unchanged; no secrets in UX helpers) |
| Production promotion | Not started | **PASS** (NO-GO retained) |

---

## 7. Evidence files

| File | Contents |
|---|---|
| `docs/audits/marketing/evidence/mkt-001f-premerge-tests-2026-07-17.txt` | Focused MKT suites |
| `docs/audits/marketing/evidence/mkt-001f-premerge-gates-2026-07-17.txt` | Re-run gates before merge |
| `docs/audits/marketing/evidence/mkt-001f-staging-verification-2026-07-17.json` | Merge SHA, deployment IDs, probe metadata |

---

## 8. Final decision

| Gate | Result |
|---|---|
| Exact SHA deployed to staging | **PASS** |
| Product regression / deploy integrity | **PASS** |
| OPS-CI-001 crawl RED | Documented unrelated — does not fail MKT-001F |
| Production untouched | **PASS** |
| Phase complete through staging | **PASS** |

**Authorized next step:** close MKT-001F staging verification only. Do **not** promote to `main` / production until MKT-001A-PROD closes and a combined production release assessment is completed.

Marketing program complete through staging: **MKT-001A, MKT-001B, MKT-001B.2 Slice 1, MKT-001C, MKT-001D, MKT-001E, MKT-001F**.
