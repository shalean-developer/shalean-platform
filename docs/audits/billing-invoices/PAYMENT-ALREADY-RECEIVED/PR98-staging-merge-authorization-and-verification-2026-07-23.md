# PR #98 — Staging merge authorization and deployment verification

**Feature:** Admin booking — Payment already received  
**Mode:** Controlled staging gate only — **production untouched**  
**Date:** 2026-07-23  
**Authorizer:** Shalean Cleaning Services (EO) via cloud agent run  
**Agent run:** https://cursor.com/agents/bc-d79be9fc-9cba-493c-b9ca-f9e85e073f1b  

---

## 1. Authorization (exact)

> **Authorize merging PR #98 into `staging` only and verify the staging deployment. Do not merge PR #96 or deploy the payment feature to Production.**

| Action | Authorized? |
|--------|-------------|
| Merge [PR #98](https://github.com/shalean-developer/shalean-platform/pull/98) → `staging` | **YES** |
| Verify staging Vercel deployment at merge SHA | **YES** |
| Merge [PR #96](https://github.com/shalean-developer/shalean-platform/pull/96) → `main` | **NO** |
| Deploy payment-already-received to Production | **NO** |

---

## 2. Executive decision

| Gate | Result |
|------|--------|
| Staging merge authorization | **GO** |
| PR #98 merged into `staging` | **PASS** |
| Exact-SHA staging Preview deployment READY | **PASS** |
| Production / PR #96 | **NO-GO** (untouched) |
| Live admin functional staging gate (Zoho / Paystack / receipt / idempotency / surfaces) | **OPERATOR** — blocked by Vercel Deployment Protection SSO for unauthenticated agents |

**Staging deployment integrity: PASS.**  
**Production remains NO-GO** until a separate, explicit production merge authorization for PR #96 after the operator functional gate reports PASS.

---

## 3. Pre-merge CI (PR #98 head)

| Check | Result | Evidence |
|-------|--------|----------|
| `vitest` (web-test) | **PASS** | https://github.com/shalean-developer/shalean-platform/actions/runs/30027057012/job/89287992314 |
| `validate-migration-filenames` | **PASS** | https://github.com/shalean-developer/shalean-platform/actions/runs/30027057674/job/89274085460 |
| GitGuardian Security Checks | **PASS** | dashboard.gitguardian.com |
| Vercel Preview (PR head `194c15c7`) | **PASS** / READY | https://vercel.com/shalean-cleaning-services/shalean-platform/7ev3Pb1mASJ7eSg5dCTT5QC72UdZ |
| Supabase Preview | SKIPPED | n/a |

PR head at merge: `194c15c790b3351b630da83ce41a8575d0dfadc5`

---

## 4. Merge traceability

| Item | Value |
|------|-------|
| Integration branch | `cursor/staging-payment-already-received-de4e` |
| PR | https://github.com/shalean-developer/shalean-platform/pull/98 |
| Base | `staging` |
| Merged at (UTC) | `2026-07-23T18:01:02Z` |
| Merged by | `app/cursor` |
| Merge commit (`staging` tip) | `1c09fd9d5799e3b27d031097c51d8a6046566176` |
| Feature settle module on `staging` | **present** (`apps/web/lib/admin/settleAdminBookingPaymentAlreadyReceived.ts`) |
| Same module on `origin/main` | **absent** |

---

## 5. Staging deployment verification

| Item | Value |
|------|-------|
| GitHub Deployment ID | `5577433835` |
| Environment | **Preview** (`production_environment: false`) |
| Deployment SHA | `1c09fd9d5799e3b27d031097c51d8a6046566176` (**exact match** to staging tip) |
| Created / READY at (UTC) | `2026-07-23T18:07:23Z` |
| GitHub commit status | **success** — `Deployment has completed` |
| Inspector | https://vercel.com/shalean-cleaning-services/shalean-platform/HjBVk4zoUae4DCdyRDCiPMFxa39W |
| Deployment URL | https://shalean-platform-p1nxsj7u2-shalean-cleaning-services.vercel.app |
| Staging branch alias | https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app |

### Alias / health probe (unauthenticated)

Both the staging alias and the deployment URL return **HTTP 302 → Vercel SSO login** for unauthenticated requests (Deployment Protection). This matches prior staging programs (e.g. MKT-001A-RC2). Exact-SHA deploy readiness is established from the GitHub Deployments API + Vercel commit status, not from an anonymous `/api/health/environment` body.

Operator follow-up (authenticated SSO session): hit `/api/health/environment` on the staging alias and confirm `deployment=staging`, `gitBranch=staging`, expected staging Supabase ref, Paystack **test** mode.

---

## 6. Production isolation proof

| Check | Result |
|-------|--------|
| PR #96 state | **OPEN**, base `main`, head `75b73db18db74f5e2b1bbda334bec1b75520f216` |
| PR #96 head ancestor of `origin/main`? | **NO** |
| Feature commit `c7cfb3e1` ancestor of `origin/main`? | **NO** |
| Staging merge `1c09fd9d` ancestor of `origin/main`? | **NO** |
| Latest Production deployment (at verification) | `592bd1c3` — `Merge pull request #100` (unrelated streaming/canonical hotfix) |
| Payment-already-received on Production | **NOT deployed** |

---

## 7. Required operator staging gate (still open)

These require an authenticated admin session on staging after the exact-SHA deploy. They are **not** claimed PASS by this document:

1. Zoho invoice status **Paid** and balance **R0.00**
2. **No** Paystack payment link / transaction
3. Payment confirmation email **and** paid PDF attached/accepted
4. Idempotency replay → no duplicate booking, allocation, or email
5. Finance, Bookings, and cleaner-assignment surfaces correct

Until that matrix is recorded PASS, **do not** authorize PR #96 → `main` or any Production deploy of this feature.

---

## 8. Explicitly not authorized

- Merging PR #96 to `main`
- Deploying payment-already-received to Production / `shalean.co.za`
- Database backfill, historical payment changes, or customer bulk communication
- Unrelated configuration or SEO/control changes beyond what already landed on `staging` via PR #98

---

## 9. Evidence file

| File | Contents |
|------|----------|
| `docs/audits/billing-invoices/PAYMENT-ALREADY-RECEIVED/evidence/pr98-staging-verification-2026-07-23.json` | Merge SHA, deployment IDs, isolation checks, SSO probe metadata |

---

## 10. Authorized next step

1. Operator: complete §7 functional gate on staging at SHA `1c09fd9d` and file PASS/NO-GO evidence.  
2. Only after PASS: issue a **separate** production authorization for PR #96 (exact tip SHA required).  
3. Until then: keep PR #96 open and Production free of this feature.
