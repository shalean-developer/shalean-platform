# PRINCESS PR A — Pricing, Quote, Reservation & Availability

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-REM-01 / PR A |
| **Branch** | `fix/princess-uat-pra-pricing-reservation` |
| **Base** | `staging` |
| **Date (UTC)** | 2026-07-15 |
| **Production** | Unchanged |

---

# Executive Decision

**PR A READY FOR STAGING MERGE REVIEW** — Critical pricing (room rates never applied) and reservation (`user_id` PGRST204 → “Could not reserve”) root causes fixed in code + staging catalog seed. Full Princess Technical UAT remains **NO-GO** until PR B–E complete.

---

# Reproduction

1. **Price not calculating:** Staging `GET /api/booking-v2/services` returned `pricePerBedroom: 0` / `pricePerBathroom: 0` for all services while `GET /api/pricing/catalog` showed bedroom/bathroom rates — booking UI only showed a flat base.
2. **Reserve failure:** Vercel runtime `POST /api/admin/bookings` **503** with `pending_payment insert failed` / `Could not find the 'user_id' column of 'bookings' in the schema cache` (`PGRST204`). Maps to customer string *"Could not reserve your booking. Please try again in a moment."*
3. Staging `bookings` columns: **`customer_id` only**.

---

# Root Cause

| Issue | Cause |
|-------|-------|
| Flat / non-updating quote | `pricing_services` staging slugs `standard-cleaning` / `deep-cleaning` vs engine lookups `standard` / `deep` |
| Reserve 503 | Pending insert wrote `user_id` on a schema that only has `customer_id` |
| Misdiagnosed errors | Reserve failures coded as `PRICING_SNAPSHOT_MISSING` |

---

# Fix

- `resolvePricingServiceSlug.ts` — alias map (`standard` ↔ `standard-cleaning`, etc.) used by booking-v2 catalog + pricing snapshot builder.
- Schema-aware ownership via `resolveBookingOwnershipColumn` + `bookingCustomerOwnershipPatch` in:
  - `insertPendingPaymentBooking.ts`
  - `linkBookingsToUserDb.ts`
  - `insertAuthenticatedBookFlowIntake.ts`
- Quote readiness gate (`bookingQuoteReadiness.ts`) on Step 4; catalog fetch checks `r.ok`.
- Confirm insert duplicate → **409 `SLOT_ALREADY_RESERVED`**; reserve error codes `RESERVATION_FAILED` / `BOOKING_SCHEMA_MISMATCH`.
- Staging-only SQL upsert of canonical `standard` / `deep` pricing rows (mirroring `*-cleaning` rates).

---

# Tests

- `lib/booking-v2/__tests__/princessPraPricingReservation.test.ts` — normal / zero bedrooms / large rooms / extras / recurring / stale / missing / alias / conflict contracts
- Updated ownership contracts in `insertPendingPaymentBookingExpiry` + `m23ResolveAuthUserIdByEmailAndLink` + `durationMinutesPersistence`
- Validation (local, pre-PR):

| Check | Result |
|-------|--------|
| Targeted Vitest (PR A) | PASS |
| `npm run test:critical` | PASS (34) |
| `npm run typecheck` | PASS |
| `npm run lint:booking-core` | PASS |
| `npm run db:migrations:validate` (repo root) | PASS |
| `npm test` (full Vitest) | 519/520 files; **1 inherited fail** `bookingQuoteLifecyclePhase8` (same as Farai Batch 2) |
| `next build --webpack` | PASS |

Evidence: `docs/audits/uat/princess/evidence-pra-*.txt`

---

# Staging Verification

After deploy of this PR to the staging branch:

1. `/api/booking-v2/services` — regular-cleaning `pricePerBedroom` / `pricePerBathroom` > 0
2. `/book` — changing rooms updates total
3. Admin/customer reserve path — no `user_id` PGRST204
4. Duplicate slot — 409 with clear copy

---

# Production Non-Impact

- No production deploy, migration, or Paystack live mode.
- Alias resolver is backward-compatible with engine slugs already on production.
- Ownership helper already preferred `customer_id` when present.

---

# Remaining Risks

- Auth reset, refunds UI, push, cron (PR B–E).
- Soft-fulfillment TOCTOU without a true slot hold.
- Services missing from staging catalog still inherit standard room rates as fallback.

---

# Retest Instructions

See `02-technical-uat-defect-reconciliation.md` § Retest.
