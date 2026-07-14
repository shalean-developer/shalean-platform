# R1.4B — Full Vitest Failure Triage

| Field | Value |
|-------|-------|
| **Activity** | R1.4B — Full Vitest Failure Triage |
| **Mode** | Audit, classification, and remediation planning **only** |
| **Date** | 2026-07-14 |
| **Suite SHA under test** | `1767291ee8f7d1dfb9af2750cf02192e40704681` (`origin/main` / staged app) |
| **Live comparison SHA** | `45ccd98f` (customer-facing) |
| **Production ops** | **None** (no migrate, promote, deploy, Vercel, domains) |
| **Code changes** | **None** |

---

# Executive Decision

All **19** Vitest test failures from the local full suite were **reproduced individually**, compared against live commit `45ccd98f`, classified with evidence, and assigned a remediation path.

**No genuine application cash-SoT regression** was found among the 19. Dedicated R1 settlement tests pass. GitHub Actions does **not** run the full suite (critical + selected revenue paths only) — which is why CI can be green while `npm test` is red locally.

The full-suite red state is **mostly pre-existing** (also fails at `45ccd98f`). The staged delta **adds** R1 writers/`20260714140000` to governance inventory scanners (H-16 / Phase 1J) and removes the live `booking-v2/confirm` direct status write from the H-16 offender list (moved into `settleFullyCoveredBooking`).

## PASS — TEST FAILURE TRIAGE COMPLETE AND REMEDIATION PLAN READY

---

# Scope and Safety

| Check | Result |
|-------|--------|
| Production DB (`tchayecuvzssixyxlvfu`) used by tests? | **No** |
| Staging DB (`gfvdiczqyrvlmynvgegd`) used? | **No** |
| `.env.local` Supabase host | `hborcpvarvgynjsjnfei.supabase.co` (non-prod unknown/dev project) |
| Secrets printed? | **No** (values redacted) |
| Migrations applied? | **No** |
| Deployments / promotions / domain moves? | **No** |
| Application / test code modified? | **No** |

**Note:** `seaPointTeams.integration.test.ts` loads `.env.local` and can mutate a hard-coded booking on that non-prod project (assign then revert). It does **not** target production.

**Worktree method:** Isolated git worktrees at `C:\Users\info\wt-r14b-main` (`1767291e`) and `C:\Users\info\wt-r14b-live` (`45ccd98f`) with junctioned `node_modules`. Primary workspace remained on audit branch with untracked docs only (no tracked dirty files required for runs).

---

# Repository and Environment Baseline

| Item | Value |
|------|--------|
| Triage suite branch / commit | detached `1767291e` = `origin/main` |
| Primary workspace HEAD (untouched for suite) | `2ea8c794` on `audit/r1-2b-staged-production-verification` |
| Tracked working tree | Clean (untracked docs / `.vercel` only) |
| OS | Windows 10.0.26200 |
| Node | v24.14.1 (CI workflow uses Node 20) |
| npm | 11.11.0 |
| Vitest | 3.2.6 (`apps/web`) |
| Env files present | `apps/web/.env.local`, `.env.example` (secrets not logged) |
| Command | `cd apps/web && npm test` → `vitest run` |
| CI vitest job | `.github/workflows/web-test.yml` runs `test:critical` + a **subset** of revenue-path files — **not** full `npm test` |

---

# Full Suite Result

**Command:** `npm test` in `apps/web` at `1767291e`  
**Evidence:** [`evidence/r1-4b-vitest-full-main-1767291e-2026-07-14.txt`](./evidence/r1-4b-vitest-full-main-1767291e-2026-07-14.txt)

| Metric | Value |
|--------|-------|
| Test files | 514 total — **21 failed** / 493 passed |
| Tests | 2872 total — **19 failed** / 2853 passed / 0 skipped (in summary) |
| Duration | ~54.5s (this run; R1.3 local run was ~273s — same failure set) |
| Failed suites (collect/load) | **12** (ENOENT at module load; contribute to failed **files**, not the 19 test count) |
| Worker crashes | None observed |
| Unhandled rejections | None material in summary |
| Timeouts | None among the 19 |

Matches R1.3 observation: **19 failed tests / 21 failed files**.

---

# Failure Inventory

## A. Nineteen failed tests (reproduced individually)

| ID | File | Test (short) | Class | Live `45ccd98f` | Staged `1767291e` | R1-related? | Release-blocking? |
|----|------|--------------|-------|-----------------|-------------------|-------------|-------------------|
| F01 | `canonicalDurationShadow.test.ts` | attaches shadow… legacy quote hours | **B** | Fail (4.5≠2.7) | Fail | No | No (outdated expectation; pricing unit coverage elsewhere) |
| F02 | `canonicalDurationShadow.test.ts` | surfaces extras-heavy… | **B** | Fail (7.3≠2.7) | Fail | No | No |
| F03 | `seaPointTeams.integration.test.ts` | lists Sea Point teams… | **F/D** | Fail (0≠2) | Fail | No | No |
| F04 | `seaPointTeams.integration.test.ts` | can assign Team Sea Point… | **F/D** | Fail (booking not found) | Fail | No | No |
| F05–F08 | `bookingsPaymentMethodChkConstraint.test.ts` | four migration content guards | **B/F** | Fail ENOENT | Fail ENOENT | No | No (constraint already in baseline; app path tests still pass) |
| F09 | `h16BookingsStatusWriteAllowList.test.ts` | every direct writer on allow-list | **B** (+ R1 delta) | Fail (pre-R1 offenders) | Fail (**+** `settleFullyCoveredBooking`) | **Yes** (delta) | **Yes — update inventory before promote** |
| F10 | `h16…` | SQL migrations documented status mutations | **B** (+ R1 delta) | Fail (baseline) | Fail (baseline **+** `20260714140000`) | **Yes** | **Yes — update inventory before promote** |
| F11 | `phase1JHighRiskBookingsWriters.test.ts` | classifies every runtime writer | **B** (+ R1 delta) | Fail | Fail (+ settleFullyCovered) | **Yes** | **Yes — update inventory before promote** |
| F12 | `phase1J…` | classifies every SQL migration | **B** (+ R1 delta) | Fail (baseline) | Fail (baseline + R1 SQL) | **Yes** | **Yes — update inventory before promote** |
| F13 | `phase1J…` | no stale SQL classifications | **B/F** | Fail (26 stale vs active tree) | Fail | No (squash debt) | No* |
| F14 | `cleanerJobDetailDisplayEnrich.test.ts` | durationHoursFromBookingRecord… | **B** | Fail (2≠5.5) | Fail | No | No |
| F15 | `executeCleanerApprovedEarningsPaystack.phase15a-order.test.ts` | shadow before claim… | **C** | Fail (mock) | Fail | No | No (payout path has other coverage; fix mock) |
| F16 | `m6m7RecurringPreferredCleanerAndOrphan.test.ts` | M-6 migration exists… | **B/F** | Fail ENOENT | Fail ENOENT | No | No |
| F17–F19 | `h12DisputeAdminAudit.test.ts` | three migration content guards | **B/F** | Fail ENOENT | Fail ENOENT | No | No |

\*F13 is understanding/debt; not an app regression. Remediate with Phase 1J inventory rewrite to baseline+active set.

## B. Twelve failed files (suite collect/load — not in the “19”)

All **ENOENT** reading `supabase/migrations/<old stamp>.sql`. Files remain under `supabase/migrations-legacy/`. Present on **both** live and staged.

| Suite file | Missing active path |
|------------|---------------------|
| `h6h4UserProfileConvergence.test.ts` | `20260939_h6_h4_user_profiles_backfill.sql` |
| `m23ResolveAuthUserIdByEmailAndLink.test.ts` | `20260935_resolve_auth_user_id_by_email_and_link.sql` |
| `h14m19HotPathCompositeIndexes.test.ts` | `20260942_h14_m19_hot_path_composite_indexes.sql` |
| `m23DispatchOfferCountersIdempotent.test.ts` | `20260932_dispatch_offer_counters_idempotent.sql` |
| `m23DispatchOffersEarningsSnapshot.test.ts` | `20260934_dispatch_offers_earnings_snapshot.sql` |
| `m24HistoricalDispatchOffersCleanup.test.ts` | `20260946_m24_historical_dispatch_offers_cleanup.sql` |
| `m20NotificationLogsBookingIdIntegrity.test.ts` | `20260947_m20_notification_logs_booking_id_uuid_chk.sql` |
| `h10CleanerFinancialRlsIdentityFix.test.ts` | `20260938_h10_cleaner_financial_rls_identity_fix.sql` |
| `h5LegacyCompletedPaymentStatusRepair.test.ts` | `20260937_h5_legacy_completed_payment_status_repair.sql` |
| `m18CleanerPayoutsUniquePeriod.test.ts` | `20260945_m18_cleaner_payouts_unique_period.sql` |
| `m23CleanersJoinedAtRepair.test.ts` | `20260933_cleaners_joined_at_repair.sql` |
| `m21SystemLogsRetentionPrune.test.ts` | `20260494_system_logs_prune_analytics_rpc.sql` |

Classification: **B/F** — post-baseline squash path drift. Content still in legacy + folded into `20260714010000_production_baseline.sql` where applicable.

Individual-run evidence: `evidence/r1-4b-individual-main-*.txt`, `evidence/r1-4b-individual-live-*.txt`.

---

# Per-Failure Analysis

### F01–F02 — Canonical duration shadow (`B`)

- **Expected:** `quoteCheckoutZarWithSnapshot(...).hours === 2.7` with shadow diagnostics for legacy vs canonical.
- **Actual:** `hours` is **4.5** (and **7.3** with extras) — engine now surfaces duration aligned with canonical/legacy minutes (~270 / higher), not the old 2.7 legacy hours axis.
- **Reproduction:** Fail alone on live and staged.
- **Relevant sources:** `lib/pricing/canonicalDurationShadow.test.ts`, `lib/pricing/pricingEngineSnapshot.ts`.
- **Severity:** Medium test debt; **not** an R1 cash regression.
- **Fix:** Update expectations / assert shadow fields against current engine contract; keep “hours used for quote money” semantics explicit.

### F03–F04 — Sea Point teams integration (`F`/`D`)

- **Expected:** Two Sea Point teams assignable; hard-coded booking `d2cfcb8d-…` exists for assign/revert.
- **Actual:** 0 teams matched; booking not found on `hborcp…` DB.
- **Reproduction:** Fail alone on live and staged (same env).
- **Severity:** Low for R1; env/fixture dependent.
- **Fix:** Skip unless curated fixture DB; or seed/update IDs; never point at prod.

### F05–F08 — Payment method CHK migration guards (`B`/`F`)

- **Expected:** Read `supabase/migrations/20260936_…sql`.
- **Actual:** ENOENT; file is in `migrations-legacy/`; constraint with `cash|zoho|eft|card` is in production baseline (verified in baseline SQL).
- **Live/staged:** Both fail.
- **Fix:** Point guards at legacy path **or** assert baseline constraint text / `pg_get_constraintdef` contract; keep AdminMarkPaid `eft` assertions (those still pass in the same file).

### F09–F10 — H-16 allow-list (`B`, R1 delta on staged)

**Live offenders (status writers):** `ensureBookingPaymentSession`, `booking-v2/confirm`, `fulfillment`, plus baseline SQL.  
**Staged offenders:** `settleFullyCoveredBooking` **replaces** confirm direct write; same ensure/fulfillment; SQL adds `20260714140000`.

- **Expected:** Every direct `bookings.status` writer / SQL mutator pre-listed.
- **Actual:** Inventory not updated after R1 settlement helper and migration landed.
- **Classification:** Outdated governance test vs **approved** R1 behaviour (not a hidden unsafe write — dedicated `settleFullyCoveredBooking` tests pass).
- **Release-blocking:** **Yes** — must acknowledge R1 paths in allow-lists before treating full-suite / governance gates as green for promote.
- **Fix (tests only unless reviewer requires relocation):** Add `lib/payments/settleFullyCoveredBooking.ts` to `APPROVED_BOOKINGS_STATUS_WRITERS`; classify `20260714140000_…sql` (and baseline policy) in `ALLOWED_SQL_BOOKINGS_STATUS_MUTATIONS`; keep ensure/fulfillment classified or route through helpers under separate design task.

### F11–F13 — Phase 1J writer inventory (`B`/`F`, R1 delta)

- **Runtime unclassified on staged:** includes `settleFullyCoveredBooking`, `ensureBookingPaymentSession`, `refundBookingPayment`, `area-review`, `fulfillment` (7 sites).
- **SQL unclassified:** baseline + `20260714140000`.
- **Stale SQL list:** 26 entries for migrations removed from active `supabase/migrations/` after squash.
- **Fix:** Re-base classifications on **active** migration tree + R1 file; move historical classifications to legacy-aware paths or document “baseline subsumes”.

### F14 — Cleaner duration from `pricing_summary` (`B`)

- **Expected:** `{ pricing_summary: { estimated_duration_minutes: 330 } }` → `5.5` hours.
- **Actual:** `2` (fallback from `durationHoursFromBookingSnapshot(null)`).
- **Cause:** `durationHoursFromBookingRecord` now resolves via `resolvePersistedBookingDurationMinutes` → `pricingSummaryFromRow` only when `isStructuredPricingBreakdown` succeeds. Sparse fixture is ignored.
- **Live/staged:** Both fail.
- **Fix:** Update fixture to structured breakdown **or** assert column/`duration_minutes` path; optionally keep a unit test that structured summaries still resolve.

### F15 — Phase 15A Paystack ordering mock (`C`)

- **Expected:** Mocked admin client supports claim flow.
- **Actual:** `assertLedgerClaimNotOnWeeklyRail` calls `admin.from("cleaner_earnings").select` — mock omits `cleaner_earnings`.
- **Live/staged:** Both fail.
- **Fix:** Extend mock chain for `cleaner_earnings` (and any new tables); no production change.

### F16–F19 — M-6 / H-12 migration path guards (`B`/`F`)

- ENOENT on active migrations; bodies live in `migrations-legacy/` and concepts exist in baseline (`preferred_cleaner_id`, dispute action CHECK, etc.).
- Behavioural portions of M-6/M-7 and H-12 files largely **pass**; only static migration-path tests fail.
- **Fix:** Read from `migrations-legacy/` or assert baseline artifacts.

---

# Live-vs-Staged Comparison

| Bucket | Finding |
|--------|---------|
| Failures already at live `45ccd98f` | F01–F08, F09–F10 (without settleFullyCovered), F11–F19, all 12 collect suites |
| Introduced / changed by staged delta | H-16 / Phase 1J lists gain **`settleFullyCoveredBooking`** + **`20260714140000`**; live **`booking-v2/confirm`** direct status write disappears from H-16 list (moved into helper) |
| R1 cash SoT unit coverage | `lib/payments/__tests__/settleFullyCoveredBooking.test.ts` — **6/6 PASS** on staged |
| CI subset | `npm run test:critical` — **34/34 PASS** on staged |
| Unapplied prod migration | Conceptual only for these unit tests (no live DB apply required for triage) |

---

# R1 Cash Source-of-Truth Analysis

| Topic | Triage result |
|-------|----------------|
| Zero-cash success / `amount_paid_cents = 0` | Covered by passing `settleFullyCoveredBooking` tests (fallback applies paid-state with zero cash) |
| `settle_booking_fully_covered` / `booking_zero_cash_success_is_r0` | Exercised via RPC mock / fallback paths in unit tests — **not** among the 19 failures |
| Old rule “every success must have positive cash” | **Not** encoded in the 19 failures; governance scanners fail because writers are **unlisted**, not because they assert positive cash |
| Monthly / credits / promotions / refunds | No cash-SoT regression signal in this failure set; `refundBookingPayment` appears only as Phase 1J “unclassified writer” |
| Distinguish unpaid / partial / credited / refunded | Not broken by these failures; separate critical suite still green |

**Conclusion:** The R1 implementation is **not** rejected by behavioural unit tests. Full-suite red is dominated by **migration-path squash debt** and **governance inventory lag**, with a **small R1-specific inventory delta** that should be updated before promote hygiene is claimed.

---

# Genuine Regressions

**None identified** among the 19 as class **A** (genuine application regression) relative to approved R1 rules or live behaviour of the same engine versions.

Closest “behaviour vs test” mismatches (F01/F02/F14) are class **B**: engines/resolvers changed earlier; tests not updated — already failing on live SHA.

---

# Outdated Tests

- F01, F02 — duration shadow hours axis  
- F05–F08, F16–F19 + 12 collect suites — hard-coded pre-baseline migration paths  
- F09–F13 — H-16 / Phase 1J inventories lag active tree and R1  
- F14 — unstructured `pricing_summary` fixture  

---

# Test Infrastructure Problems

- Full `npm test` ≠ CI vitest job (gap allowed local “19 red” while Actions green)
- Content-guard tests assume linear `supabase/migrations/*.sql` history after squash into baseline + `migrations-legacy/`
- `seaPointTeams.integration.test.ts` depends on private `.env.local` dataset
- Phase 15A test mock incomplete after `assertLedgerClaimNotOnWeeklyRail` introduction

---

# Pre-existing Failures

Essentially **all 19** fail at live `45ccd98f` with the same root causes, except the **composition** of H-16/Phase 1J offender lists changes with R1 (`settleFullyCovered` / R1 SQL / confirm route relocation).

---

# Release-Blocking Findings

| ID | Blocking? | Why |
|----|-----------|-----|
| F09–F12 (H-16 / Phase 1J R1 inventory) | **Yes (governance / promote hygiene)** | Booking payment status writers + R1 SQL must be explicitly classified before claiming release test readiness |
| F01–F08, F13–F19, collect suites | **No** (with remediation tickets) | Understood, pre-existing or fixture/path debt; critical + R1 settlement coverage green; do **not** skip/delete tests |

Independent passing coverage for R1 money path: `settleFullyCoveredBooking` unit tests + `test:critical` + R1.3 R1-focused vitest (26 tests) from prior audit.

---

# Remediation Plan

## 1. Must fix / update before promotion

| Item | Files | App code? | Tests? | Verification |
|------|-------|-----------|--------|--------------|
| Acknowledge R1 settlement status writer | `h16BookingsStatusWriteAllowList.test.ts` (+ optional helper docs) | Only if relocating writes | **Yes** | `npm test -- lib/booking/__tests__/h16BookingsStatusWriteAllowList.test.ts` |
| Classify R1 + baseline SQL status/payment mutations | same + `phase1JHighRiskBookingsWriters.test.ts` | No | **Yes** | both inventory files green |
| Classify `settleFullyCoveredBooking` (and remaining legitimate writers) in Phase 1J | `phase1JHighRiskBookingsWriters.test.ts` | No (unless consolidating) | **Yes** | Phase 1J green |

**Expected behaviour:** Allow-lists document approved R0/R1 settlement and payment-session writers; scanners match repo.

**Risk:** Low if limited to inventory updates with reviewer ack; Medium if mistakenly suppressing new unsafe writers — require dual review of each added path.

**Regression coverage:** Keep `settleFullyCoveredBooking` tests; re-run H-16 + Phase 1J + `test:critical`.

## 2. Must update before promotion because tests encode outdated approved rules

Same as §1 for H-16/Phase 1J. No evidence the **business** rule “zero-cash success forbidden” remains in these failures.

## 3. Test infrastructure remediation

| Item | Approach | Effort |
|------|----------|--------|
| Migration content guards | Resolve via `migrations-legacy/` **or** baseline substring contracts | M (batch ~16 files) |
| Phase 1J stale SQL set | Rebuild against active 10 migrations + documented legacy map | M |
| Phase 15A mock | Add `cleaner_earnings` chain | S |
| Duration / shadow tests | Align fixtures & expectations to quote engine | S |
| Sea Point integration | `describe.skipIf` without fixture flag / seed doc | S |
| CI gap | Optionally add full `npm test` or migration-guard job post-remediation | M (process) |

## 4. Pre-existing unrelated debt

- Baseline squash vs content-guard ecosystem (H/M audits)
- Node 24 local vs Node 20 CI (no failure attributed to this in the 19)

## 5. Non-blocking follow-up

- Consider wiring R1 settlement into CI revenue-path list explicitly
- Document that full local suite is not the merge gate today

**Do not:** suppress, skip, delete, or weaken assertions without replacing coverage.

---

# Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| Promote while H-16/Phase 1J still red | Med | Complete §1 before calling test readiness GO |
| Mistaking inventory debt for cash regression | High confusion | This triage; keep R1 unit tests as SoT |
| Pointing integration tests at prod | Crit if misconfigured | Keep asserting non-prod project refs in safety gate |
| Expanding CI to full suite without §3 | High noise | Remediate path guards first |

---

# Final Decision

## PASS — TEST FAILURE TRIAGE COMPLETE AND REMEDIATION PLAN READY

All 19 failures reproduced, live-compared, classified, and assigned remediation. No unexplained failures. Test environment confirmed **non-production**.

---

# Next Authorized Action

1. Authorize a **test-only remediation** change set implementing §1 (H-16 / Phase 1J inventories for R1) and preferably §3 path-guard batch.  
2. Re-run full `npm test` + `test:critical` on the remediation SHA.  
3. Do **not** promote `dpl_8HHQpf8erBkdeJ6Rst7Fmhiqriph` under this triage.  
4. Do **not** apply production migration `20260714140000` under this triage (separate R1.4A-EXEC with complete ops packet).

**Stop:** triage report complete; no code fixes, commits, merges, deploys, or migrations performed in R1.4B.
