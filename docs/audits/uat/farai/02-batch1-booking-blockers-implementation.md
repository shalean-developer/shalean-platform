# FARAI-UAT Batch 1 — Booking blockers implementation

| Field | Value |
|-------|-------|
| **Ticket** | FARAI-UAT-REM-01 / PR A |
| **Branch** | `fix/farai-uat-booking-blockers` |
| **Date** | 2026-07-15 |
| **Scope** | UAT-BOOK-003, UAT-BOOK-004 |

---

# Executive Decision

Implementation complete for suburb resolve + Step 1/2 dependency gates. Staging verification and fixture seed required before **PASS**.

---

# UAT Blocker Summary

| ID | Fix |
|----|-----|
| UAT-BOOK-003 | Catalog-aligned slug normalisation + aliases; no premature error while loading; Other → actionable unsupported guidance; Step 1 requires resolved UUID |
| UAT-BOOK-004 | Calendar / booking-type disabled without `serviceAreaLocationId`; Return to Step 1; deep-link to Step 2+ redirects if area unresolved; location change clears schedule/cleaner/team |

---

# Files Changed

- `apps/web/lib/booking/resolveLocationId.ts`
- `apps/web/lib/booking-v2/useBookingV2LocationResolve.ts`
- `apps/web/app/api/booking-v2/resolve-location/route.ts`
- `apps/web/src/features/booking-v2/schemas.ts`
- `apps/web/src/features/booking-v2/BookingV2Context.tsx`
- `apps/web/src/features/booking-v2/components/PropertyAddressSection.tsx`
- `apps/web/src/features/booking-v2/steps/Step2Schedule.tsx`
- `apps/web/lib/booking/__tests__/faraiUatBookingSuburbGate.test.ts`

---

# Automated Validation

- Unit: `faraiUatBookingSuburbGate.test.ts`, `bookingLocations.test.ts` — pass
- Full suite / typecheck / lint / build — run before merge

---

# Staging Verification

Pending deploy + smoke (12-point checklist in reconciliation doc).

---

# Remaining Defects

UAT-DATA-001/002 → PR B seed. Batches 2–4 deferred.

---

# Final Decision

**Conditional** — code remediation ready; overall UAT PASS requires fixtures + staging verification.
