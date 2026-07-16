# FARAI-UAT-REM-02 — PR #10 Staging Merge and Smoke Verification

| Field | Value |
|-------|-------|
| **Ticket** | FARAI-UAT-REM-02 |
| **Date** | 2026-07-15 |
| **PR** | https://github.com/shalean-developer/shalean-platform/pull/10 |
| **Target branch** | `staging` only |
| **Production** | Not modified / not promoted |
| **Operator** | Cursor agent (via Farai `gh` credentials) |

---

# Executive Decision

**PASS — FARAI BOOKING UAT UNBLOCKED FOR RETEST**

PR #10 is merged to `staging`, the staging Vercel deployment is **READY** with correct environment identity, the 12-point smoke checklist passed on the staging preview, Deep/Move synthetic teams and multiple cleaner scenarios are testable, Paystack remains test-only, and production was not promoted.

Farai may resume UAT from Booking Step 1 on:

`https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/book`

Do **not** begin Batches 2–4. Do **not** merge to `main`.

---

# PR Review

| Check | Result |
|-------|--------|
| 1. Targets `staging` | **PASS** — `baseRefName: staging` |
| 2. No unreviewed commit after validated head | **PASS** — head `f07831c354ae262cd78702dcee7c56094d193238` (2 commits); merged as-is |
| 3. Diff scope only Batch 1 + fixtures + docs | **PASS** — 14 files: suburb resolve, Step 1/2 gating, seed tooling, UAT docs, runbook |
| 4. No production migration changed | **PASS** — no `supabase/migrations` in PR |
| 5. No live payment logic changed | **PASS** — no Paystack live-path files |
| 6. No production env var changed | **PASS** — no Vercel/env production edits |
| 7. Seed tooling refuses production | **PASS** — `seed-uat-booking-fixtures.mjs` hard-refuses production ref |
| 8. Seed data synthetic + idempotent | **PASS** — `uat-book-*` / `UAT *` / `FARAI-UAT-BOOK-*` fixtures |
| 9. Required checks pass | **PASS** — mergeable with required checks green prior to merge |
| 10. No unresolved Critical review issue | **PASS** |

Pre-merge verdict: **GO — ready to merge to staging**.

---

# Merge Evidence

| Field | Value |
|-------|-------|
| PR number | **#10** |
| Head SHA | `f07831c354ae262cd78702dcee7c56094d193238` |
| Merge method | **Merge commit** (`gh pr merge --merge`) |
| Merge SHA | `8dd64da39d08fe17d2b4b164d8728625c541050c` |
| Merged at (UTC) | `2026-07-15T08:01:15Z` |
| Operator | Cursor agent / Farai (`gh`) |
| Merged into | `staging` |
| Merged into `main`? | **No** |

---

# Staging Deployment

| Field | Value |
|-------|-------|
| Deployment ID | `dpl_DoTMitEHSApciDnm46yfCjnh2LUm` |
| Branch | `staging` |
| Commit | `8dd64da39d08fe17d2b4b164d8728625c541050c` |
| Ready state | **READY** |
| Vercel `target` | `null` (preview — **not** production) |
| Branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Customer domain assigned? | **No** — alias is staging git branch only |
| Production promoted? | **No** |

Inspector: https://vercel.com/shalean-cleaning-services/shalean-platform/DoTMitEHSApciDnm46yfCjnh2LUm

---

# Environment Health

`GET /api/health/environment` on staging alias (`2026-07-15T08:12:33Z`):

| Field | Observed | Expected |
|-------|----------|----------|
| `shaleanAppEnv` | `staging` | staging |
| `gitBranch` | `staging` | staging |
| `vercelEnv` | `preview` | preview |
| Supabase ref | `gbgnemlpyykyhpqqbgru` | `gbgnemlpyykyhpqqbgru` |
| Paystack secret/public | **test** | test |
| Outbound messaging | `outboundDisabled: true` | suppressed |
| Issues | `[]` | empty |

Identity mismatch stop condition: **not triggered**.

---

# 12-Point Smoke Test

Staging URL: `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app`  
Service path verified: `/book/regular-cleaning` (not `standard-cleaning`).

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Booking Step 1 loads | **PASS** | `/book/regular-cleaning` — “Your details”, staging banner |
| 2 | Supported suburb suggestions load | **PASS** | Suburb dropdown lists Cape Town areas + Other |
| 3 | No premature service-area error while loading/typing | **PASS** | No red service-area error before selection; resolve deferred |
| 4 | Supported suburb → valid service-area UUID | **PASS** | Claremont → `2c7a3bb4-8a71-45e7-9c0c-33d28959edde` via resolve API + sidebar |
| 5 | Valid suburb clears stale error immediately | **PASS** | After Claremont resolve, unsupported/amber guidance cleared; sidebar shows Claremont |
| 6 | Step 2 unusable until Step 1 valid | **PASS** | Schedule stepper disabled on Step 1; `?step=2` without UUID redirected to Step 1 |
| 7 | After valid suburb, calendar available | **PASS** | Step 2 July 2026 calendar interactive |
| 8 | Date/time availability loads | **PASS** | 2026-07-16 → slots 8:00 AM–12:30 PM |
| 9 | Changing suburb clears date/time/cleaner/team | **PASS** | After suburb change to Sea Point, draft showed empty `date`/`time`/`selectedCleanerIds` and sidebar showed Sea Point (code path in `BookingV2Context`) |
| 10 | Deep Cleaning shows eligible synthetic teams | **PASS** | UI: **UAT Deep Team Alpha/Bravo Available** (also lists Move teams — see Issues) |
| 11 | Move-In/Out shows eligible synthetic teams | **PASS** | `/book/moving-cleaning?step=2` shows **UAT Move Team Alpha/Bravo** |
| 12 | Paystack test mode; safe progress to payment | **PASS** | Health: test keys; reached Step 4 Payment (auth gate) with **no live charge** |

---

# Cleaner Fixture Verification

Staging Supabase `gbgnemlpyykyhpqqbgru` (service-role probe):

- **8** UAT cleaners (`uat-book-%` emails): Highly Rated, New, Average, Unavailable, Outside Service Area, No Deep Move Capability, Schedule Conflict, Eligible Fallback
- Regular Cleaning Step 2 (Claremont, 16 Jul 09:00): **multiple** eligible UAT cleaners listed as Available
- **Excluded from available Claremont slot list:** Outside Service Area (after time context); Unavailable Offline not shown as Available
- Note: `cleaner_availability` windows were seeded on staging during REM-02 validation so slot cleaners populate; fold into seed script as follow-up if reseed wipes availability

---

# Team Fixture Verification

- **4** teams: UAT Deep Team Alpha/Bravo, UAT Move Team Alpha/Bravo
- Deep Cleaning UI: Deep teams selectable/available
- Moving Cleaning UI: Move teams visible/available
- Soft note: `team-availability` currently returns all four teams for both deep and moving services (UI shows both sets). Still sufficient for Farai Deep/Move team UAT.

---

# Paystack Test-Mode Verification

| Check | Result |
|-------|--------|
| Staging health Paystack mode | **test** / **test** |
| Live charge attempted | **No** |
| Reached payment step | **Yes** (Step 4 requires sign-in; no initialize live charge) |

---

# Production Non-Impact

| Check | Result |
|-------|--------|
| PR merged to `main`? | **No** |
| Staging deploy `target` | `null` (not production) |
| Customer domains moved? | **No** |
| Production migrations applied? | **No** |
| Production Vercel vars changed? | **No** |
| Production keys used for seed/smoke writes? | **No** (`production.keys.env` absent; no prod writes) |
| Staging UAT fixtures leaked to production query? | Not directly queryable (no prod keys); **no production mutations performed** |
| Production booking count changed by smoke? | **No writes to production** — smoke only hit staging preview + staging Supabase |
| Unrestricted customer messaging? | Staging `outboundDisabled: true`; no outbound sends performed |

Latest production-target deployment remains prior `main` work (e.g. `dpl_ZHmN235f…` / ENV-03), not PR #10.

---

# Issues Found

| ID | Severity | Notes |
|----|----------|-------|
| REM02-SOFT-01 | Low | Deep/Move team picker lists all four UAT teams rather than service-filtered subset. Does not block Deep/Move UAT. |
| REM02-SOFT-02 | Low | `cleaner_availability` for UAT cleaners was applied as a staging follow-up seed during smoke; prefer folding into `seed-uat-booking-fixtures.mjs` before next full reseed. |
| REM02-SOFT-03 | Low | Suburb control accessible name often remains “Suburb *” after selection; sidebar/location resolve still correct. |
| REM02-NOTE-01 | Info | Production UAT-row absence not SQL-verified (no local production keys). Isolation evidenced by merge/deploy scope + no prod writes. |

No Critical defects. No environment isolation breach.

---

# Farai Retest Decision

**Farai may resume business UAT from Booking Step 1** on the staging preview above.

Suggested first path:

1. Open staging `/book` → Regular Cleaning  
2. Select supported suburb (e.g. Claremont / Devil's Peak Estate)  
3. Continue to Schedule → pick date/time → observe multiple UAT cleaners  
4. Repeat Deep Cleaning and Move In/Out for team scenarios  
5. Progress to Payment using Paystack **test** only  

Do not begin Batches 2–4 until Farai retest feedback is recorded.

---

# Final Decision

**PASS — FARAI BOOKING UAT UNBLOCKED FOR RETEST**

| Gate | Status |
|------|--------|
| PR #10 merged to staging | Done |
| Staging deployment READY | Done |
| Environment identity correct | Done |
| 12-point smoke | All PASS |
| Deep + Move teams available | Done |
| Multiple cleaner scenarios testable | Done |
| Paystack test-only | Done |
| Production unchanged | Done |
| Evidence complete | This document |

**STOP** — Batches 2–4 not started. `main` not merged. Production not migrated or promoted.
