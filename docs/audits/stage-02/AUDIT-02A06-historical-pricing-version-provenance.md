# AUDIT-02A06 — Historical pricing-version provenance

Status: **Closed — governed historical exception**

Date: 2026-10-12

## Scope

Bounded Stage 02 source-of-truth reconstruction for historical Booking V2 rows with a missing `bookings.pricing_version_id`.

No booking, payment, payout, invoice, accounting, or pricing data was modified during this audit.

## Production population

Read-only production audit on Supabase project `paqjwfulwywtsyyvdxrq` found:

- Booking V2 rows with `paystack_reference LIKE 'bv2_%'`: 53
- Rows with `pricing_version_id IS NULL`: 53
- Paid/settled rows among them: 52
- New missing rows since 2026-10-07: 0
- Creation window: 2026-06-16 through 2026-09-13

## Immutable provenance sources checked

The 53 rows were checked against every surviving durable source that could prove an exact pricing-version identity:

- `bookings.price_snapshot`
- `bookings.booking_snapshot`
- nested `booking_snapshot.locked`
- nested snapshot pricing fields
- `bookings.metadata`
- `bookings.pricing_summary`
- `bookings.price_breakdown`
- `bookings.service_details`
- `booking_line_items.metadata`
- `booking_changes`
- `failed_jobs.payload`
- `payment_transactions.raw_gateway_payload`
- booking/payment payload `config_hash` evidence
- surviving `bookings.quote_id`

Results:

- pricing-version ID evidence in booking snapshots/metadata: 0/53
- pricing-version ID evidence in line items: 0/53
- pricing-version evidence in booking-change history: 0/53
- pricing-version evidence in failed-job/recovery payloads: 0/53
- payment transactions present: 53/53
- pricing-version evidence in Paystack raw payloads: 0/53
- config-hash evidence in booking/payment payloads: 0/53
- surviving quote_id: 0/53

Only 28/53 historical rows have normalized booking line items, and none of those line items carries a pricing-version identifier.

## Pricing-version ledger context

The production `pricing_versions` table contains historical version rows, so a version can be inferred by booking timestamp.

Timestamp-only candidate grouping yields:

- 1 booking falls after pricing version `53bacad9-8598-4b07-8fad-861ed7600531` and before the next version.
- 52 bookings fall after pricing version `b29caefd-818e-4a09-86cb-457cc9702620` and before the next version.

This is **not proof** of which pricing version was frozen for an individual booking.

A historical quote may have been created earlier and confirmed later, and there is no surviving booking-level signed lock, version ID, config hash, or immutable request payload tying these rows to those candidate versions.

## Historical code timeline

Repository history shows:

- 2026-09-22: Booking V2 began persisting the frozen pricing version.
- 2026-09-22: signed/versioned quote locks were introduced.
- 2026-10-08: Booking V2 snapshot embedding of pricing version was hardened further.

All 53 target bookings predate the 2026-09-22 provenance mechanism.

## Classification

- **Provable exact pricing-version IDs: 0/53**
- **Unprovable historical rows: 53/53**

## Decision

**Do not backfill `pricing_version_id` on these 53 historical bookings.**

Assigning a pricing version from booking creation time would manufacture financial provenance rather than reconstruct an immutable historical fact.

These rows are retained as explicit historical exceptions with unknown pricing-version provenance.

## Current-path status

The active Booking V2 write/finalization path now:

- persists `pricing_version_id` on the pending booking;
- preserves the persisted value during Paystack finalization;
- stamps the resolved version back into the immutable checkout price snapshot.

Read-only production reconciliation found **0 new missing Booking V2 pricing-version rows since 2026-10-07**.

## Closure

AUDIT-02A06 is closed without a financial repair.

No staging fixture mutation, production backfill, payout change, invoice change, payment change, or accounting change is authorized by this closeout.

Any future historical repair attempt must first produce new immutable booking-level provenance evidence. Timestamp inference alone is explicitly insufficient.
