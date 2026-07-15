# Farai UAT Defect Reconciliation

| Field | Value |
|-------|-------|
| **Ticket** | FARAI-UAT-REM-01 |
| **Date** | 2026-07-15 |
| **Environment** | Isolated staging (`gbgnemlpyykyhpqqbgru`) |
| **Production** | Unchanged (`tchayecuvzssixyxlvfu`) |
| **Spreadsheet** | Not found in repo / Downloads at audit start — inventory built from remediation brief defect IDs + codebase evidence |
| **Current UAT decision** | **BLOCKED** (pre-remediation) |

---

# Executive Decision

Pre-remediation: **NO-GO — FARAI BOOKING UAT REMAINS BLOCKED** on Booking Step 1 suburb/service-area selection and insufficient staging cleaner/team fixtures.

Batch 1 + test-data remediation targets a return to **PASS — FARAI BOOKING UAT BLOCKERS REMEDIATED** after staging deploy and verification (see companion batch reports).

---

# UAT Blocker Summary

| ID | Title | Blocks |
|----|-------|--------|
| UAT-BOOK-003 | Location dropdown shows service-area error before a valid selection can be made | Step 1 → availability |
| UAT-BOOK-004 | Schedule controls allow date selection while suburb validation is incomplete | Step dependency integrity |
| UAT-DATA-001 | Insufficient synthetic cleaner fixtures | Cleaner recommendation / eligibility UAT |
| UAT-DATA-002 | Insufficient synthetic teams for Deep / Move | Deep + Move-In/Out UAT |

Primary funnel under test: **booking-v2** (`/book/[serviceSlug]`), not classic `/booking` Step 1 (which has no suburb picker).

---

# Defect Inventory

## UAT-BOOK-003

| Field | Value |
|-------|-------|
| **Title** | Location dropdown shows service-area error before a valid selection can be made |
| **Current severity** | Blocker (UAT) |
| **Recommended severity** | **P0 / Blocker** |
| **Business impact** | Farai cannot progress past Booking Step 1; full booking UAT stopped |
| **Reproduction status** | Reproduced in code path (eager resolve + slug mismatch + optional unresolved Continue) |
| **Root cause** | Step 1 uses static free-text suburb labels; `/api/booking-v2/resolve-location` maps labels with weaker slug rules than the catalog (`locationLabelToSlug` keeps apostrophes; catalog strips them / applies aliases). Resolve runs immediately on any label ≥2 chars. Listed suburbs (e.g. Devil's Peak Estate, Simon's Town, D'urbanvale) and `"Other"` can 422 while the control still looks selectable. Staging may also lack `locations` / cleaner coverage rows. |
| **Source files** | `PropertyAddressSection.tsx`, `useBookingV2LocationResolve.ts`, `resolve-location/route.ts`, `bookingV2LocationContext.ts`, `resolveLocationId.ts`, `bookingLocations.ts` |
| **API/DB** | `GET /api/booking-v2/resolve-location`, `public.locations` |
| **Classification** | **Genuine defect** (+ staging data gap amplifies) |
| **Remediation batch** | Batch 1 / PR A |
| **Required tests** | Valid suburb; unsupported/Other; alias + mixed-case; delayed resolve; stale error clear |
| **Acceptance criteria** | Supported listed suburb resolves to UUID without premature error; unsupported shows actionable guidance; errors clear on valid selection |

## UAT-BOOK-004

| Field | Value |
|-------|-------|
| **Title** | Schedule controls allow date selection while suburb/service-area validation is incomplete |
| **Current severity** | Blocker (UAT) |
| **Recommended severity** | **P0 / Blocker** |
| **Business impact** | Users pick dates/times against unresolved area; availability empty or misleading; UAT confusion |
| **Reproduction status** | Confirmed by design in code |
| **Root cause** | `step1Schema` does not require `serviceAreaLocationId`. `canGoNext(1)` ignores resolve errors. Step 2 `CustomCalendar` is not gated on `areaResolved` (only time slots are). URL `?step=2` can skip Step 1 re-validation. |
| **Source files** | `schemas.ts`, `BookingV2Context.tsx`, `Step2Schedule.tsx`, `TimeSlotPicker.tsx` |
| **API/DB** | `GET /api/booking/time-slots` (requires UUID `locationId`) |
| **Classification** | **Genuine defect** |
| **Remediation batch** | Batch 1 / PR A |
| **Required tests** | Invalid Step 1 blocks Step 2; calendar disabled without area; location change clears schedule |
| **Acceptance criteria** | No actionable date selection without resolved service area; clear Return to Step 1; location change clears date/time/cleaner |

## UAT-DATA-001

| Field | Value |
|-------|-------|
| **Title** | Insufficient synthetic cleaner fixtures |
| **Current severity** | Blocker (UAT scenarios) |
| **Recommended severity** | **P0** for UAT completeness |
| **Business impact** | Cannot exercise rating tiers, unavailability, out-of-area, capability miss, conflict, fallback |
| **Reproduction status** | Confirmed — ENV-03 seed creates one staging cleaner without `cleaner_locations` / scenario matrix |
| **Root cause** | Test-data gap |
| **Source files** | `scripts/env/seed-nonprod.mjs`, seeds under `supabase/seed/` |
| **API/DB** | `cleaners`, `cleaner_locations`, `bookings` (conflict), Auth users |
| **Classification** | **Test-data gap** |
| **Remediation batch** | Batch 1 test-data / PR B |
| **Required tests** | Fixture isolation guard; eligibility scenarios documented |
| **Acceptance criteria** | ≥8 synthetic UAT cleaners with deterministic scenarios; names prefixed TEST/UAT; staging-only; idempotent seed/reset |

## UAT-DATA-002

| Field | Value |
|-------|-------|
| **Title** | Insufficient synthetic teams for Deep Cleaning and Move-In/Out |
| **Current severity** | Blocker (Deep/Move UAT) |
| **Recommended severity** | **P0** |
| **Business impact** | Deep / Move team selection cannot be validated |
| **Reproduction status** | Confirmed — no UAT teams in ENV-03 seed |
| **Root cause** | Test-data gap |
| **Source files** | Same seed tooling; `teams`, `team_members` |
| **API/DB** | `teams.service_type` ∈ `deep_cleaning` \| `move_cleaning`; roster ≥2 |
| **Classification** | **Test-data gap** |
| **Remediation batch** | Batch 1 test-data / PR B |
| **Required tests** | Team availability by service |
| **Acceptance criteria** | ≥2 Deep teams, ≥2 Move teams; Standard/Airbnb/Office covered via solo cleaners; conflict + fallback scenarios |

---

## Batch 2 — Booking UX / service information (deferred)

| ID (provisional) | Title | Classification | Batch |
|------------------|-------|----------------|-------|
| UAT-BOOK-UX-001 | Unsupported-area recovery guidance | UX enhancement / partial defect | 2 / PR C |
| UAT-BOOK-UX-002 | “What’s Included” buttons and anchors | Genuine defect (anchors) | 2 / PR C |
| UAT-BOOK-UX-003 | Missing Standard Cleaning included section | Content / missing feature | 2 / PR C |
| UAT-BOOK-UX-004 | Move-In vs Move-Out option simplification | UX enhancement | 2 / PR C |
| UAT-BOOK-UX-005 | Furnished-property question clarity | UX enhancement | 2 / PR C |
| UAT-BOOK-UX-006 | Final rental inspection question clarity | UX enhancement | 2 / PR C |
| UAT-BOOK-UX-007 | Conditional Move-Out-only questions | Genuine defect / UX | 2 / PR C |
| UAT-BOOK-UX-008 | Custom recurring schedule | Missing feature — **backlog design first** | Backlog (not partial-ship) |

## Batch 3 — Navigation / IA (deferred)

| ID (provisional) | Title | Classification | Batch |
|------------------|-------|----------------|-------|
| UAT-NAV-001 | Pricing points to booking | Label/destination mismatch | 3 / PR D |
| UAT-NAV-002 | Help points directly to FAQ | IA / duplicate semantics | 3 / PR D |
| UAT-NAV-003 | Get Instant Quote vs Book Now duplicate | UX / IA | 3 / PR D |
| UAT-NAV-004 | Areas We Serve names not clickable | Missing feature / UX | 3 / PR D |
| UAT-NAV-005 | Broken/missing `#included` anchors | Genuine defect | 3 / PR D |
| UAT-NAV-006 | Excessive service-page redirects | Technical debt / UX | 3 / PR D |

## Batch 4 — Branding / legal (deferred)

| ID (provisional) | Title | Classification | Batch |
|------------------|-------|----------------|-------|
| UAT-BRAND-001 | Footer logo asset/rendering | Genuine defect / content | 4 / PR E |
| UAT-BRAND-002 | About page colour-token usage | Branding debt | 4 / PR E |
| UAT-LEGAL-001 | Privacy Policy completeness | Content/legal — needs business approval | 4 / PR E |
| UAT-LEGAL-002 | Terms and Conditions completeness | Content/legal — needs business approval | 4 / PR E |

---

# Duplicate and Reclassified Findings

| Finding | Disposition |
|---------|-------------|
| Classic `/booking` Step 1 “missing suburb” | Not a duplicate of BOOK-003 — suburb lives on schedule step via UUID `ServiceAreaPicker`. Do not treat as same root cause. |
| Empty service-area picker when no cleaner coverage | Related amplifier of BOOK-003 on widget path; remediates with UAT-DATA seed (`cleaner_locations`). |
| Custom recurrence | **Not** a Batch 1 blocker — record as approved backlog item after design (every X days/weeks/months, weekdays, end date/count, preview, generation implications). |

---

# Root Cause Analysis

```text
Booking UI (static suburb label)
        ↓
useBookingV2LocationResolve (eager fetch, length ≥ 2)
        ↓
/api/booking-v2/resolve-location
        ↓
resolveLocationContextFromLabel  ← slug rules weaker than bookingLocationSlug
        ↓
serviceAreaLocationId optional in step1Schema
        ↓
Step 2 calendar enabled without areaResolved
        ↓
time-slots / cleaners / teams need UUID + coverage rows
        ↓
staging fixtures thin → empty/misleading availability
```

---

# Batch Plan

| PR | Scope | Branch target |
|----|-------|---------------|
| **A** | Suburb resolve, Step 1 UUID gate, Step 2 calendar gate, clear stale schedule | `staging` |
| **B** | Synthetic cleaners/teams seed + reset docs | `staging` |
| C–E | Deferred per stop condition | — |

---

# Files Changed

See batch implementation reports (populated as PRs land).

---

# Test Data Added

See PR B / `scripts/env/seed-uat-booking-fixtures.mjs`.

---

# Automated Validation

Required before PASS: affected unit tests, booking critical suite, full Vitest, typecheck, lint, migration validate, production build, staging smoke (no production promote).

---

# Staging Verification

Checklist after Batch 1 + fixtures deploy (12 items from remediation brief).

---

# Remaining Defects

Batches 2–4 and custom recurrence backlog remain open after Batch 1 stop condition.

---

# Retest Instructions

1. Open staging booking Step 1 for Standard, Deep, Move-In, Move-Out.
2. Select Claremont / Sea Point — no premature service-area error; Continue enabled only after resolve.
3. Confirm Step 2 calendar disabled until Step 1 valid; after valid location, dates load times.
4. Confirm cleaner/team matrices appear for scenarios.
5. Confirm Paystack test mode; no production project mutations.

---

# Final Decision

**Pre-remediation:** NO-GO — FARAI BOOKING UAT REMAINS BLOCKED  

**Post Batch 1 + fixtures (pending verification):** decision recorded in `02-batch1-booking-blockers-implementation.md` / `03-batch1-uat-fixtures-implementation.md`.
