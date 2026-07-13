# Changelog — booking payment settlement Phase A (2026-07-13)

## Fixed

- Booking V2 confirm no longer writes payable amounts into collected-cash columns before Paystack success (BK-001).
- R0 fully covered settlement now fails confirm when persistence fails; zero cash allowed with linked promo/credit ledger (BK-002).
- Admin equipment fee updates preserve collected cash on paid bookings and adjust `total_price` only (BK-003).

## Added

- ADR: booking payment settlement vs cash columns.
- Forward migration `20261076_bookings_r0_paid_amount_constraint.sql`.
- Dry-run data repair script `repairPendingCollectedCashAnomaly.ts`.

## Not in this release

- BK-004 cleaning credit pre-spend redesign and later audit findings.
