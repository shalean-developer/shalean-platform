# MKT-001E — Staging Verification

**Program:** Marketing Platform Remediation  
**Phase:** MKT-001E — Platform Intelligence / Operational Decision Engine (staging verification)  
**Mode:** Controlled staging verification — **production untouched**  
**Source:** `docs/audits/marketing/MKT-001E-platform-intelligence.md`  
**Rules catalog:** `docs/audits/marketing/MKT-001E-operational-intelligence-rules.md`  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/50  
**Date:** 2026-07-17  

---

## 1. Executive decision

**PASS** for staging.

MKT-001E is merged into `staging`, deployed at the exact merge SHA, and verified for deployment integrity, regression safety, review checklist, and runtime non-error on intelligence routes. The phase is **complete through staging verification**.

**Production remains NO-GO.** `staging → main` stays blocked while MKT-001A-PROD is open.

---

## 2. Staging gate matrix

| Gate | Status |
|---|---|
| PR #50 review checklist (code) | **PASS** |
| PR #50 merged into `staging` | **PASS** |
| Exact staging SHA `db3f16b6` deployed | **PASS** |
| Staging deployment READY | **PASS** |
| Targeted regression suite | **PASS** (33/33) |
| Staging `/api/health/environment` | **PASS** (`deployment=staging`, `gitBranch=staging`) |
| Runtime error scan (intelligence routes, 2h) | **PASS** (0 errors) |
| `main` / production untouched | **PASS** |
| Admin-authenticated intelligence UI smoke | **OPERATOR** (Vercel SSO + admin session) |
| Live internal link crawl (CI) | **RED (unrelated)** — pre-existing prod `/locations/*` 404s |

---

## 3. Deployment traceability

| Item | Value |
|---|---|
| Feature branch | `feature/mkt-001e-platform-intelligence` |
| Merge commit (staging tip) | `db3f16b6ce78dbbab5a929ba57c7e37f508016cb` |
| Feature commits | `d2e9e11b` (feat), `bb2a4159` (typecheck fix) |
| Vercel deployment | `dpl_BsDyp9V5g6YATdSZv4KkQzauWake` |
| Deployment SHA | `db3f16b6` (exact match) |
| Ready state | **READY** |
| Staging branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Deployment URL | `https://shalean-platform-62cc5u2j5-shalean-cleaning-services.vercel.app` |
| Production / `main` | **Untouched** — `db3f16b6` is **not** an ancestor of `origin/main` (`ad5b4ccb`) |

---

## 4. Review checklist (pre-/post-merge)

| Check | Result |
|---|---|
| Metrics use authoritative SoT (jobs/history/ledger/accounts/cron_runs/registry) | **PASS** |
| Thresholds centralized in `publishIntelligenceCatalog.ts` | **PASS** |
| Decision builders deterministic / side-effect free | **PASS** — pure functions in `publishIntelligenceDecision.ts` |
| No recommendation without evidence | **PASS** — unit-tested explainability contract |
| Secrets / tokens / payloads excluded | **PASS** — jobs list omits payload bodies; admin-only |
| Empty/low-volume → null rates | **PASS** — unit-tested |
| p50/p95 nearest-rank correct | **PASS** — unit-tested |
| Stale cron / queue-stall windows defensible | **PASS** — 60m worker stale; 30m/2h oldest-queue |
| Saved views = filters only | **PASS** — `windowHours` / provider / campaign in localStorage |
| Drill-downs behind `requireAdminApi` | **PASS** |
| Queries bounded | **PASS** — head counts + capped selects |
| Intelligence cannot affect publish execution | **PASS** — read-only path; no `runPublish` / claim edits |
| MKT-001A–D + B.2 controls unchanged | **PASS** |

---

## 5. Verification evidence

### 5.1 Tests (post-merge)

```text
npx vitest run \
  lib/promotions/__tests__/publishIntelligence.mkt001e.test.ts \
  lib/promotions/__tests__/mkt001dCompletion.test.ts \
  lib/promotions/__tests__/publishJobs.mkt001b2.test.ts

Test Files  3 passed (3)
Tests       33 passed (33)
```

Evidence: `docs/audits/marketing/evidence/mkt-001e-staging-verification-tests-2026-07-17.txt`

### 5.2 Health / deploy

Evidence: `docs/audits/marketing/evidence/mkt-001e-staging-verification-2026-07-17.json`

### 5.3 Operator smoke (remaining)

With an authorized staging admin session:

1. Open Growth → Platform Intelligence  
2. Toggle 24h / 72h / 7d; set provider/campaign filters; save a view  
3. Confirm SLIs, alerts/recs/DQ empty-or-populated states  
4. If DLQ rows exist, Replay still works via B.2 endpoint  
5. Confirm Social Posts / Connected Accounts unchanged  

---

## 6. CI note

PR #50 `vitest` job failed only on **Live internal link crawl** against production `shalean.co.za` `/locations/*` 404s — same unrelated RED classified on MKT-001B/C/D merges. Typecheck, migration governance, GitGuardian, and Vercel deployment **PASS**.

---

## 7. GO / NO-GO

| Decision | Status |
|---|---|
| **MKT-001E staging** | **Complete** — verification **PASS** |
| **MKT-001E production** | **NO-GO** |
| **MKT-001A-PROD** | Still **OPEN** — blocks `staging → main` |

**Release rule (unchanged):** no production deploy and no merge to `main` until MKT-001A-PROD is formally closed.

*End of MKT-001E staging verification.*
