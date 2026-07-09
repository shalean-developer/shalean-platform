# retry-notifications

**Phase:** 1 — Priority 3c  
**Schedule:** `*/5 * * * *`  
**Split from:** `apps/web/app/api/cron/retry-failed-jobs/route.ts`

## Responsibility

Retry failed notification / lifecycle jobs only.

## Scope (ONLY)

- `booking_lifecycle_jobs` where status = `failed_retryable` (attempts < 5)
- `retryLifecycleJobsForBooking` for `lifecycle_issue` bookings
- `processReviewSmsPromptQueue`
- `processAbandonCheckoutReminders`

## Source files to port

| File | Function |
|------|----------|
| `lib/booking/processLifecycleJob.ts` | `processLifecycleJob` |
| `lib/booking/bookingLifecycleJobs.ts` | `retryLifecycleJobsForBooking` |
| `lib/reviews/reviewPromptSms.ts` | `processReviewSmsPromptQueue` |
| `lib/conversion/abandonCheckoutReminder.ts` | `processAbandonCheckoutReminders` |
| `_shared/resend.ts` | Email sends |

## NOT in this function

- WhatsApp queue drain → `whatsapp-worker`
- Booking insert retries → `retry-booking-jobs`

## Not implemented yet

Awaiting architecture approval.
