# BILL-INV-002 Phase A — Staging Verification Report

| Field | Value |
|-------|-------|
| **Activity** | Phase A technical review, CI, staging deploy, verification |
| **Audit timestamp (UTC)** | `2026-07-20T19:35:00Z` |
| **Authorization** | Technical review + CI + staging deploy (Paystack **test** only); stop after this report + gate update |
| **Mode** | Staging-only — **production untouched** |
| **PR** | https://github.com/shalean-developer/shalean-platform/pull/74 |
| **Feature branch** | `fix/bill-inv-002-phase-a-payment-amount-integrity` |
| **Feature tip SHA** | `45ed53b09fbf066182ed8080d88f21fc4a297e65` |
| **Staging merge SHA** | `78868bb0745cf88754ad94ca116ba4c8f0f0bd38` |
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` (`shalean-platform-staging`) |
| **Staging alias** | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| **Vercel staging deploy** | `Dcj6NWh7ESQzdNDMfLSnyALL1xRL` — **READY** (commit status success for `78868bb0`) |

---

## 1. Executive decision

**CONDITIONAL / INCOMPLETE** for full Phase A staging verification.

Cleared in this authorization window:

- Technical review of PR #74 (including post-review rotation fix)
- CI validation on tip `45ed53b0` (vitest, migration governance, GitGuardian, Vercel preview)
- Merge of Phase A into `staging` at `78868bb0`
- Staging Vercel deployment **READY** for that merge SHA
- Focused unit evidence for amount integrity, quarantine routing, branded URLs, cleared-link ref rotation, and apply quarantine

**Not cleared** (objective live Paystack **test** evidence still missing):

- Exact-amount end-to-end charge on keyed staging
- Stale-link regeneration via browser/landing against staging Paystack
- Changed-balance rejection via live webhook/verify on staging
- Duplicate webhook idempotency against staging gateway
- Partial-payment success UX on staging
- Office branded-link copy smoke (admin session)
- Multi-charge refund block with staging fixture
- Deploy rollback drill on staging alias

**Blocker:** Vercel Deployment Protection (SSO login wall) on the staging alias — unauthenticated HTTP to `/pay/invoice` returns `302` → `vercel.com/sso-api`. Staging DB currently has **0** `monthly_invoices` rows, so there is also no existing fixture set for live probes without creating test invoices through an authenticated session.

**Production remains NO-GO.** Ledger backfill and accounting-sync cron activation remain **not authorized**.

---

## 2. Staging gate matrix

| Gate | Status |
|------|--------|
| PR #74 technical review ready (not draft) | **PASS** — `isDraft=false`, mergeable |
| CI on tip `45ed53b0` | **PASS** — vitest, validate-migration-filenames, GitGuardian, Vercel preview |
| Rotation fix for cleared-link re-init | **PASS** — commit `45ed53b0` + unit coverage |
| Merged into `staging` | **PASS** — `78868bb0` |
| Exact staging SHA deployed / READY | **PASS** — Vercel status success for `78868bb0` |
| Phase A unit / apply quarantine suite | **PASS** — 16/16 focused tests (see §4.2) |
| Staging schema present (`monthly_invoices`, charge dedup) | **PASS** |
| Staging invoice fixtures for live Paystack | **FAIL / EMPTY** — `invoice_count = 0` |
| Unauthenticated staging HTTP pay matrix | **BLOCKED** — Deployment Protection SSO |
| Live Paystack test E2E cases (exact / stale / mismatch / idempotency / partial / refund) | **OPERATOR** — requires SSO bypass + admin session + test keys |
| `main` / production untouched | **PASS** — `78868bb0` is **not** an ancestor of `origin/main` (`c2c04d42`) |
| Ledger backfill / accounting-sync activation | **NOT RUN** — out of authorization |
| Customer communication / live charge | **NOT RUN** — out of authorization |

---

## 3. Deployment traceability

| Item | Value |
|------|-------|
| Implementation commits | `83d5ea61` (Phase A controls), `45ed53b0` (cleared-link ref rotation) |
| Staging merge | `78868bb0` — *merge: BILL-INV-002 Phase A into staging for Paystack test verification* |
| Contains feature tip | **Yes** — `45ed53b0` is ancestor of `origin/staging` |
| Production tip | `c2c04d42` (unchanged) |
| Production Supabase | `tchayecuvzssixyxlvfu` — **not** linked / not mutated in this window |
| Staging DB project | `gbgnemlpyykyhpqqbgru` — read probes only |

Conflict note on merge: add/add on `MKT-001M-foundation-production-release-closure.md` resolved by retaining migration runbook section; unrelated to billing controls.

---

## 4. Verification evidence

### 4.1 Technical review + CI (PR #74)

| Check | Result | Evidence |
|-------|--------|----------|
| Draft → ready for review | PASS | `gh pr view 74` → `isDraft=false` |
| vitest (web-test) | PASS | run `29771618030` job `88450932479` |
| validate-migration-filenames | PASS | run `29771618306` |
| GitGuardian | PASS | PR check rollup |
| Vercel preview (feature branch) | PASS | `Cyyj5e461JL6ZAS7DxFhDMNqHp4A` |
| Review blocker (post-adjust re-init conflict) | Fixed | `persistMonthlyInvoicePaystackReferenceDecision` allows rotation when `payment_link` is null |

### 4.2 Focused regression tests (post-fix)

```text
cd apps/web && npx vitest run \
  lib/monthlyInvoice/__tests__/applyMonthlyInvoicePaymentChildAllocation.test.ts \
  lib/monthlyInvoice/__tests__/billInv002PhaseAAmountIntegrity.test.ts

Test Files  2 passed (2)
Tests       16 passed (16)
```

Maps to required cases (code-level):

| Required case | Unit / code evidence | Live staging Paystack |
|---------------|----------------------|------------------------|
| Exact-amount payment | Charge must equal remaining balance; balance-bound `_b{cents}` refs | **OPERATOR** |
| Stale-link regeneration | Landing clears link; cleared-link ref rotation for open statuses | **OPERATOR** |
| Changed-balance rejection | Apply quarantine → `amount_mismatch_quarantined`; no settle/ledger | **OPERATOR** |
| Duplicate webhook idempotency | Existing already-processed / dedup short-circuit path retained; quarantine short-circuits | **OPERATOR** |
| Partial-payment handling | Success-page + apply remaining-balance semantics covered in suite/code | **OPERATOR** |
| Branded links | `trustMonthlyInvoicePayPageUrl` asserts app `/pay/invoice` host | **OPERATOR** (office copy) |
| Refund blocking | `multi_charge_refund_unsupported` when >1 charge dedup row | **OPERATOR** (fixture) |
| Rollback | Revert staging deploy to prior SHA (ops) | **OPERATOR** |

### 4.3 Staging database (Supabase `gbgnemlpyykyhpqqbgru`)

| Check | Result |
|-------|--------|
| `public.monthly_invoices` exists | **PASS** |
| `public.monthly_invoice_paystack_charge_dedup` exists | **PASS** |
| Invoice row count | **0** |
| Charge dedup count | **0** |

No live settlement / quarantine / webhook rows available to inspect on staging without creating Paystack test invoices.

### 4.4 Runtime HTTP (staging alias)

```text
curl -sI https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/pay/invoice
→ HTTP/1.1 302 Found
→ Location: https://vercel.com/sso-api?url=…%2Fpay%2Finvoice&nonce=…
```

Unauthenticated probes cannot reach app routes. Same class of gate as prior MKT staging verifications.

### 4.5 Explicit non-actions (authorization boundary)

| Action | Status |
|--------|--------|
| Production deploy / merge to `main` | **Not performed** |
| Production migration | **Not performed** |
| Live Paystack charge | **Not performed** |
| Ledger backfill (9 paid-without-ledger) | **Not performed** |
| `accounting-sync` cron activation | **Not performed** |
| Customer communication | **Not performed** |

---

## 5. Case-by-case outcome

| # | Case | Outcome | Notes |
|---|------|---------|-------|
| 1 | Exact-amount payment | **CODE PASS / LIVE BLOCKED** | Unit + apply path enforce balance match |
| 2 | Stale-link regeneration | **CODE PASS / LIVE BLOCKED** | Clear link + rotate ref when link null |
| 3 | Changed-balance rejection | **CODE PASS / LIVE BLOCKED** | Quarantine; no paid; link cleared |
| 4 | Duplicate webhook idempotency | **CODE PASS / LIVE BLOCKED** | Needs staging webhook replay evidence |
| 5 | Partial-payment handling | **CODE PASS / LIVE BLOCKED** | Needs staging partial charge + UI |
| 6 | Branded links | **CODE PASS / LIVE BLOCKED** | Needs office/admin copy smoke |
| 7 | Refund blocking | **CODE PASS / LIVE BLOCKED** | Needs two-dedup fixture on staging |
| 8 | Rollback | **NOT EXECUTED** | Documented: redeploy prior staging SHA |

---

## 6. Updated gate decision (binding for this window)

| Scope | Gate |
|-------|------|
| Local Phase A implementation | **PASS** |
| PR #74 technical review + CI | **PASS** |
| Staging code promotion + deploy (`78868bb0`) | **PASS** |
| Staging live Paystack test verification matrix | **NO-GO** until operator SSO + objective test evidence for cases 1–8 |
| Production / `main` | **NO-GO** |
| Ledger backfill | **Not authorized** |
| Accounting-sync / reminder cron activation | **Not authorized** |

Operating exception from audit amendment remains:

- Stale Paystack sessions after balance change: **NO-GO** for customer payment
- Freshly balance-bound sessions: **CONDITIONAL PASS** only after Phase A controls are live-proven on staging

---

## 7. Recommended next authorization

> Approve **operator-led** BILL-INV-002 Phase A staging Paystack **test** matrix on deployment `78868bb0` / staging alias, using Vercel SSO (or temporary share bypass) and an admin session. Create disposable staging monthly invoices; verify exact-amount charge, stale-link regeneration, changed-balance quarantine, duplicate webhook idempotency, partial payment, branded link copy, multi-charge refund block, and staging rollback. Deliver objective evidence (masked refs, screenshots/logs, DB aggregates). No production deployment, live charge, production migration, ledger backfill, accounting-sync activation, or customer communication. Stop after updated staging verification closure and gate amendment.

Production approval should only be considered after all Phase A staging cases pass with objective Paystack test evidence.

---

*End of BILL-INV-002 Phase A staging verification report.*
