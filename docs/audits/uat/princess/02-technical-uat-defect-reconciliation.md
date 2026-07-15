# PRINCESS-UAT-REM-01 — Technical UAT Defect Reconciliation

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-REM-01 |
| **Audit timestamp (UTC)** | `2026-07-15T18:35:00Z` |
| **Mode** | Staging-only technical remediation (Phase 1 stop after PR A) |
| **Staging URL** | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` |
| **Production Supabase** | `tchayecuvzssixyxlvfu` (untouched) |
| **Paystack** | test |
| **Messaging** | suppressed / allowlisted on staging |

---

# Executive Decision

**NO-GO — PRINCESS TECHNICAL UAT REMAINS BLOCKED**

Critical/High pricing + reservation blockers for PR A are remediated in code and staging data, but this stop condition only delivers **PR A**. Auth, refunds, push/retry, and booking-lifecycle cron remain open (PR B–E). Full PASS requires those follow-ons plus staging retest of Critical/High items outside PR A.

---

# Reproduction baseline (Phase 1)

| # | Defect | Route / surface | Evidence | Severity | Inherited? |
|---|--------|-----------------|----------|----------|------------|
| 1 | Slow login/logout | `/auth/login` → `POST /api/auth/resolve-profile` → `POST /api/bookings/link-user` | Serial post-auth hops; `link-user` 500s on staging (`user_id` PGRST204) inflate latency | Medium–High | Inherited |
| 2 | Password reset failure | `/auth/forgot-password` → `/api/auth/forgot-password` → `/auth/reset-password` | Staging redirect / outbound messaging gates; fragile recovery session bootstrap | High | Inherited |
| 3 | Booking price not calculating | `/book` → `GET /api/booking-v2/services` → `useBookingV2Pricing` | Staging `pricing_services` used SEO slugs (`standard-cleaning`) while engine looked up `standard` → **room rates = 0** (base-only quote) | **Critical** | Inherited (staging catalog drift) |
| 4 | Reservation error *"Could not reserve your booking…"* | `POST /api/admin/bookings` / Paystack initialize → `insertPendingPaymentBookingRow` | Runtime log `18:11:23Z`: `PGRST204` *Could not find the 'user_id' column* → mislabeled `PRICING_SNAPSHOT_MISSING` 503 | **Critical** | Inherited (schema split) |
| 5 | Intermittent availability conflicts | `/api/booking/time-slots` vs confirm | No slot-hold RPC; `pending_payment` occupies cleaners; TOCTOU preferred-cleaner races | High | Inherited |
| 6 | Missing refund option | Office booking detail | Paystack refund API exists; `BookingDetailsView` never wires `onRefund` | High | Inherited (Phase 11b) |
| 7 | Push notification failure | Customer devices API / cleaner app | Tokens stored or local-only; **no Expo send path** | High | Inherited (P2-WF-001) |
| 8 | Retry handling failure | `/api/admin/notifications/retry` | Channel-limited; staging outbound disabled; push unsupported | Medium–High | Inherited |
| 9 | booking-lifecycle cron no success | `POST /api/cron/booking-lifecycle` | **Not in `vercel.json`**; depends on pg_cron + `CRON_SECRET` | **Critical** | Inherited |

Sanitized staging ownership schema: `bookings` has **`customer_id` only** (no `user_id` column).

---

# Root-cause summary (PR A scope)

### Pricing / quote
- Booking-v2 catalog resolved `DB_SLUG_MAP` engine ids (`standard`, `deep`) against staging rows named `standard-cleaning` / `deep-cleaning`.
- Miss → static `SERVICE_CONFIG.basePrice` + **`pricePerBedroom/Bathroom = 0`**.
- Symptom: total shows a flat base and does not move with rooms (UAT: “price not calculating”).
- Authoritative calculator remains `calculateCustomerTotal` / `resolveBookingV2Quote` (single SoT for `/book`).

### Reservation
- `insertPendingPaymentBookingRow` wrote `{ customer_id, user_id }` (or `user_id: null`).
- Staging PostgREST rejects unknown `user_id` → **PGRST204** → customer copy *"Could not reserve your booking…"*.
- Same class of bug in `linkUnlinkedBookingsByEmail` and authenticated flow intake ownership stamp.

### Availability
- Soft fulfillment + unpaid `pending_payment` occupancy explain intermittent conflicts; PR A adds clearer **409 `SLOT_ALREADY_RESERVED`** and keeps server-side recheck on confirm. Deeper hold/lock is deferred if still failing after PR A retest.

---

# Ordered PR plan (staging only)

| PR | Scope | Status |
|----|-------|--------|
| **A** | Pricing slug aliases + catalog rates; schema-aware ownership on reserve; quote readiness; conflict codes; tests | **This delivery** |
| **B** | Login latency instrumentation; password reset staging URL/session; authz matrix | Planned |
| **C** | Paystack test recovery, webhooks, duplicate settlement | Planned |
| **D** | Refund UI + governed workflow (separate approval if finance schema needed) | Planned |
| **E** | Push synthetic devices, notification retry, booking-lifecycle cron observability | Planned |

Do **not** merge to `main`. Do **not** promote production.

---

# Staging data actions (non-production)

On `gbgnemlpyykyhpqqbgru` only:

- Upserted canonical `pricing_services` rows `standard` and `deep` mirroring existing `*-cleaning` rates (bedroom/bathroom non-zero).
- Production `tchayecuvzssixyxlvfu` not queried for writes.

---

# Remaining risks (outside PR A)

- Password reset and outbound messaging gates.
- Refunds unwired in Office booking UI.
- Push send path absent.
- booking-lifecycle scheduler not registered on Vercel.
- Soft-fulfillment optimistic capacity (P2-OPS-004).

---

# Retest instructions (after PR A deploys to staging)

1. Open staging with Vercel auth; `/book` regular cleaning.
2. Change bedrooms 0 → 2 → 6+ and bathrooms; confirm total and duration move.
3. Add extras; confirm add-on lines.
4. Complete confirm → payment-session (Paystack **test**).
5. Admin create-with-payment: must not return reserve 503 / `user_id` schema error.
6. Duplicate same customer/slot: expect **409**, not opaque 500/503.
