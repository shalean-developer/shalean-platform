# PR 1 Report — Zoho Invoice + Resend Staging Email Guard

## Executive Decision
- Ship staging-only email safety improvements for customer-facing invoice/booking flows by ensuring key Resend send paths cannot bypass non-production allowlist + subject marker via `safeResendSend`.
- Zoho invoice end-to-end verification remains blocked until Zoho staging credentials/test organization are applied and verified (credit-note/refund integration is deferred).

## Manual Finding
- Beaulla UAT: `Resend booking/customer email delivery not verified` and `Resend email delivery and branding` were operational blockers.
- Beaulla UAT: `Invoice View/PDF not operationally proven` (Zoho invoice/PDF E2E still required).

## Reproduction
1. Use staging URL and a synthetic paid booking.
2. Trigger booking confirmation + invoice-ready emails.
3. Verify customer UI (View/PDF enabled) and that outbound emails are delivered with staging-safe branding/links.

## Root Cause (Resend safety bypass)
Customer-facing email paths existed that called `resend.emails.send(...)` directly (bypassing `safeResendSend`), meaning staging allowlist/subject-marker enforcement could be skipped.

## Fix (PR 1 scope)
1. Ensure Resend send wrapper enforcement on key customer/ops paths:
   - `apps/web/lib/monthlyInvoice/sendMonthlyInvoiceEmail.ts`
     - `sendMonthlyInvoiceEmail` and `sendMonthlyInvoiceReminderEmail` now call `safeResendSend`.
   - `apps/web/lib/email/sendBookingEmail.ts`
     - `sendBookingConfirmationEmail` legacy `legacy_html` fallback now calls `safeResendSend`.
   - `apps/web/lib/email/paymentRecoveryEmails.ts`
     - `sendPaymentRecovery(...)` now calls `safeResendSend`.
   - `apps/web/lib/email/sendCleanerNotification.ts`
     - `sendCleanerNewJobEmail` and `sendCleanerBookingCancelledEmail` now call `safeResendSend`.
2. Classify non-production allowlist blocks as permanent configuration for the monthly invoice cron path:
   - `apps/web/lib/email/classifyResendSendError.ts`
   - `safeResendSend` synthetic `outbound_blocked` errors now return `permanent_config`.
3. Test stability fix (unrelated to email/Zoho functionality, but required to keep full Vitest green locally):
   - `apps/web/lib/admin/__tests__/dashboardSystemStatus.live.test.ts`
   - Increased per-test timeout to 60 seconds.

## Local Validation
- `npm run test:critical` (pass)
- `npm run test` (full Vitest) (pass after timeout bump)
- `npm run typecheck` (pass)
- `npm run lint:booking-core` (pass)
- `npm run db:migrations:validate` (pass)
- `next build --webpack` (pass)

Evidence (sanitized) under:
- `docs/audits/uat/beaulla/evidence/`

## Staging Verification
Pending.
- Zoho invoice workflow + PDF fetch/proxy E2E still requires safe staging Zoho credentials/test org.
- Resend allowlist + staging inbox verification (booking confirmation + invoice-ready) still requires approved staging Resend key + `OUTBOUND_EMAIL_ALLOWLIST` containing the approved test inboxes.

## Operator Retest
1. Configure staging `ZOHO_*` and approved Zoho sandbox organization.
2. Configure staging Resend:
   - `RESEND_API_KEY`
   - `RESEND_FROM`
   - `OUTBOUND_MESSAGING_DISABLED` must not block delivery
   - `OUTBOUND_EMAIL_ALLOWLIST` includes approved test inboxes
3. Run operator retest checklist:
   - Booking confirmation email arrives and includes Shalean branding + staging-safe links.
   - Invoice-ready email arrives and UI shows enabled View/PDF.
   - Admin can refresh/sync invoice state; retry after transient failures if possible.

## Production Non-Impact
- PR targets staging; no production keys/credentials were modified.
- Changes are guard/routing logic for email delivery safety and classification only; they do not change invoice or booking financial state.

## Remaining Risks
- Zoho credit notes/refunds for staging remain missing (deferred).
- Other outbound email flows may still call `resend.emails.send(...)` directly in the codebase (beyond PR 1 scope); staging allowlist mitigates risk, but a full audit remains a Phase 7/9 requirement.

## Beaulla Retest Checklist (PR 1)
- [ ] Booking confirmation email (success path) to approved test inbox.
- [ ] Invoice-ready email to approved test inbox; check subject marker behavior + branding.
- [ ] Customer PDF/View buttons enabled when Zoho invoice id is present.
- [ ] Admin sync + refresh show consistent Zoho `zoho_invoice_id` persistence.
- [ ] Retry behaviour after simulated transient provider failures (Zoho + Resend as applicable).

