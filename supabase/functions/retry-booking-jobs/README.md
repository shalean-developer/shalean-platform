# retry-booking-jobs

**Phase:** 1 — Priority 3a  
**Schedule:** `* * * * *`  
**Split from:** `apps/web/app/api/cron/retry-failed-jobs/route.ts`

## Responsibility

Retry `failed_jobs` where type is `booking_insert` or `payment_reconciliation` → call `finalizePaidBooking`.

## Scope (ONLY)

- Select batch from `failed_jobs` (attempts < 25)
- Quarantine malformed payloads → `booking_insert_invalid_payload`
- Retry via finalize pipeline
- Exhausted → terminal type + critical alert
- Delete row on success

## Source files to port

| File | Function |
|------|----------|
| `lib/booking/bookingOperations.ts` | `finalizePaidBooking`, `upsertResultFromFinalizePaidBookingOp` |
| `lib/booking/paystackMetadata.ts` | `normalizePaystackMetadata` |
| `lib/booking/normalizeEmail.ts` | Email normalize |
| `lib/booking/failedJobs.ts` | Payload types |

## NOT in this function

- Lifecycle emails → `retry-notifications`
- Dispatch queue → `retry-dispatch`
- Payment mismatch drain → `retry-payment-jobs`

## Not implemented yet

Awaiting architecture approval.
