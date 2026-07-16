# BEA-EMAIL-001 — Booking confirmation email remediation

| Field | Value |
|-------|-------|
| **Defect** | BEA-EMAIL-001 |
| **Date (UTC)** | 2026-07-16 |
| **Environment** | Staging (code + migration) |
| **Status** | Fixed (code); staging template apply pending |

---

## Root cause

Confirmation emails used the booking UUID as `booking_reference` and the full Paystack charge id as `payment_reference`. Payload assembly did not load `bookings.booking_reference`, extras, suburb, or recurring summary. Total paid preferred snapshot `total_zar` over charged cents. CTA linked to the bookings list, not the booking detail.

---

## Before / after

| Field | Before | After |
|-------|--------|-------|
| Booking ref | UUID | `SHL-BK-######` (or “Pending”) |
| Payment ref | Full Paystack id | `PAY-######` (last 6 alnum) |
| Service / date / time / address | Sparse / generic when snapshot thin | Resolved from snapshot + booking row |
| Suburb | Folded into address only | Separate row when known |
| Extras | Omitted | Human-readable list |
| Recurring | Omitted | Frequency + days summary |
| Cleaner | Selected cleaner only | Assigned cleaner preferred; pending copy |
| Total paid | Snapshot-first | Charged cents first (`resolveCustomerTotalPaidZar`) |
| View booking | `/account/bookings` | `/account/bookings/{id}` |

---

## Changes made

| File | Change |
|------|--------|
| `lib/booking/customerBookingReference.ts` | `displayCustomerPaymentReference` |
| `lib/email/bookingEmailPayload.ts` | Extended payload (refs, suburb, extras, recurring, cleaner status) |
| `lib/email/resolveBookingEmailFields.ts` | Resolve extras / suburb / recurring / cleaner status |
| `lib/email/sendBookingEmail.ts` | Payload + legacy HTML customer formatting |
| `lib/templates/bookingConfirmedData.ts` | Template vars use customer refs + detail URL |
| `lib/templates/templateDefaults.ts` | Defaults for new fields / raw HTML keys |
| `lib/notifications/notifyBookingEvent.ts` | Select `booking_reference`, extras, `cleaner_id` |
| `lib/notifications/resendBookingConfirmationEmails.ts` | Same select + payload wiring |
| `lib/customer/customerAccountPaths.ts` | `customerAccountBookingUrl` |
| `supabase/migrations/20260716170000_beaulla_booking_confirmed_email_customer_refs.sql` | DB `booking_confirmed` template upgrade |

---

## Evidence

- Unit: `lib/templates/__tests__/bookingConfirmedData.test.ts`
- Unit: `lib/booking/customerBookingReference.test.ts` (PAY- formatting)
- Safeguards: still uses `safeResendSend` + outbound allowlist (unchanged)

Screenshots: deferred until staging Preview deploy + allowlisted resend.

---

## Remaining risks

- Staging must apply the new migration before DB-template path shows new layout.
- Historic emails already sent keep old content (no rewrite).
- Admin resend still logs full Paystack ref for ops; customer body uses `PAY-…`.
