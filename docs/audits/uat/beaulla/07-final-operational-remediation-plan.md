# BEAULLA Operational Remediation Plan (Staging-Only)

This document consolidates:
1. Phase 1 reconciliation (manual vs automated probe)
2. Phase 2 Zoho capability inventory (code audit)
3. Phase 7/8 Resend capability inventory + staging-only config requirements (code audit)

Operational source of truth: Beaulla manual UAT. Automated probes are used only for supporting evidence.

## Phase 0 — Reconciliation Baseline

Reconciliation table:
- `docs/audits/uat/beaulla/06-operational-remediation-reconciliation.md`

Automated evidence referenced:
- `docs/audits/uat/beaulla/evidence/beaulla-staging-probe-2026-07-16T0838Z.json`
  - Confirms health/login/some cron/finance samples
  - Does NOT provide Zoho invoice/PDF/Resend email end-to-end evidence

## Phase 2 — Zoho Capability Inventory (code audit)

Classification key:
- implemented and verified
- implemented but unconfigured
- partial
- missing
- unsafe
- deferred

> All Zoho items below are currently **implemented but unverified** in staging because no safe Zoho staging credentials/test org were applied/confirmed in this batch.

| Capability | Evidence in code | Classification |
|---|---|---|
| OAuth/token model (offline access + refresh token) | `apps/web/lib/zoho/zohoBooksClient.ts` uses `ZOHO_REFRESH_TOKEN` to refresh access tokens and caches in-memory | implemented but unconfigured |
| Organization ID | `zohoBooksClient.ts` requires `ZOHO_ORGANIZATION_ID` for all requests | implemented but unconfigured |
| Customer/contact sync | `zohoBooksService.ts` `getOrCreateContact()` searches by email/name then creates contact; handles Zoho duplicate-name error code 3062 | implemented but unconfigured |
| Invoice creation (monthly + per-booking + sales docs) | `createZohoInvoice()` in `zohoBooksService.ts` + `syncMonthlyInvoiceToZohoBooks.ts` creates/updates Zoho invoices and persists `zoho_invoice_id` | implemented but unconfigured |
| Invoice update for drafts | `updateZohoInvoice()` supports draft-only updates | implemented but unconfigured |
| Invoice fetch | `getZohoInvoice()` calls `/invoices/{id}` and normalizes status/amount/balance/tax | implemented but unconfigured |
| PDF fetch/download | `zohoBooksService.ts` `getZohoInvoicePdf()` + `zohoInvoicePdfResponse()` returns 503/404/502 consistently | implemented but unconfigured |
| Payment sync | `markZohoInvoicePaid()` posts `/customerpayments` with invoice application | implemented but unconfigured |
| Retry logic (rate limit + sync queue) | `zohoBooksClient.request()` rate-limits 429 retry; sync retries via `accounting_sync_records` + `processAccountingSyncQueue()` | implemented but unconfigured |
| Webhook/callback handling | No Zoho webhook/callback implementation found in repo (only Paystack/Meta/WhatsApp/etc) | missing |
| Error logging / operator visibility | Zoho sync status and errors stored in `accounting_sync_records`; operator API: `apps/web/app/api/admin/zoho-integration/route.ts` exposes config + sync queue | partial |
| Admin status visibility | `GET /api/admin/zoho-integration` returns `zoho_configured`, `oauth_configured`, and `sync_queue.pending_count/failed_records` | implemented but unconfigured |
| Customer-facing invoice fallback when Zoho unavailable | UI/payload behaviour avoids broken buttons by gating PDF/View on `zoho_invoice_id`; PDF route returns 503 when Zoho not configured and 404 when missing Zoho doc id | partial |
| Credit-note support | No credit-note/refund sync code found; no credit note related Zoho endpoints in `apps/web/lib/zoho` | missing |
| Refund sync | No Zoho refund sync/refund note handling found | missing |
| Staging test organization/account | Requires a Zoho sandbox/test org and server-based OAuth credentials (`ZOHO_*`) | deferred (cannot proceed without safe staging org/credentials) |

### Phase 2 Immediate Gaps
1. End-to-end proof for Zoho invoice/PDF routes and persistence of `zoho_invoice_id`
2. Credit-note/refund policy decision (deferred because Zoho credit-note integration is missing)

## Phase 7/8 — Resend Capability Inventory (code audit)

Classification key for this section:
- safe/allowlisted (uses `safeResendSend`)
- blocked by policy (non-production allowlist)
- direct send bypasses staging allowlist/marker guard

### Resend safety primitives
- `apps/web/lib/email/safeResendSend.ts`
  - Non-production allowlist gating via `decideOutboundEmail()`
  - Applies visible subject marker in non-production
- Notification retry uses `safeResendSend`:
  - `apps/web/lib/notifications/notificationRetry.ts` → `retryNotificationFromLog()` uses `safeResendSend`

### Direct Resend call sites (remaining inventory summary)
Code audit of `resend.emails.send(...)` indicates remaining direct Resend sends in several modules (e.g. marketing/growth, some auth-critical password reset, sales documents, some lifecycle/rebook, and some booking helper variants).

For PR 1 staging compliance, the operationally critical customer-facing paths involved in Beaulla’s manual UAT blockers are addressed below.

### PR 1 (implemented safely in this batch) — key customer/ops paths now use `safeResendSend`
1. Monthly invoice emails (invoice ready + reminder)
   - `apps/web/lib/monthlyInvoice/sendMonthlyInvoiceEmail.ts`
   - Replaced direct `resend.emails.send` with `safeResendSend`
   - Updated classifier so non-production allowlist blocks (`outbound_blocked`) are treated as `permanent_config`
2. Booking confirmation legacy HTML fallback
   - `apps/web/lib/email/sendBookingEmail.ts` `sendBookingConfirmationEmail()` (legacy_html fallback)
   - Replaced direct `resend.emails.send` with `safeResendSend`
3. Payment recovery emails
   - `apps/web/lib/email/paymentRecoveryEmails.ts`
   - Replaced direct `resend.emails.send` with `safeResendSend`
4. Cleaner email notifications
   - `apps/web/lib/email/sendCleanerNotification.ts`
   - Replaced direct `resend.emails.send` with `safeResendSend` (subject/marker still controlled via allowlist)

### Known residual risk (deferred to later PR/retest)
- Other customer-facing email flows still call `resend.emails.send` directly (examples present in codebase):
  - some abandoned checkout reminders
  - payment link “short copy” path
  - sales document email (quote/invoice)
  - lifecycle rebook path
  - marketing/growth/referrals/subscriptions
- Password reset uses non-production outbound decision logic but still calls Resend directly (auth-critical exception is intentionally custom in `sendPasswordResetEmail.ts`).

## Phase 8 — Resend staging-only configuration requirements (exact env var names)

Exact variables come from:
- `apps/web/.env.example`
- outbound guard `apps/web/lib/env/outboundMessagingSafety.ts`

Required for `safeResendSend` to deliver in staging non-production:
1. `RESEND_API_KEY`
2. Sender identity:
   - `RESEND_FROM` (preferred), OR
   - `RESEND_FROM_EMAIL` + `RESEND_FROM_NAME` (legacy split support)
3. Outbound allowlist and gating (non-production):
   - `OUTBOUND_MESSAGING_DISABLED` (must not be `true` for normal email delivery)
   - `OUTBOUND_EMAIL_ALLOWLIST` (comma/space/newline separated recipients lowercased and matched)
   - Optional lab override (NOT for shared staging): `OUTBOUND_MESSAGING_ALLOW_ALL=true`

Deployment env identity:
- `SHALEAN_APP_ENV` (preferred) controls whether `safeResendSend` considers the deployment as `staging` and applies `[SHALEAN STAGING — TEST]` subject marker.

### Hard stopping conditions for this batch
If no staging-safe Resend API key exists OR `OUTBOUND_EMAIL_ALLOWLIST` cannot include approved test inboxes:
- GATE — RESEND STAGING KEY AND APPROVED TEST INBOX REQUIRED

