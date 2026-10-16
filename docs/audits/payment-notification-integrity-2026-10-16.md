# Payment notification integrity — 16 October 2026

Owner request: fix misleading payment reminders, incomplete booking confirmations and failed office alerts. The owner selected `info@shalean.co.za` as the office inbox. Delivery follows isolated changes → regression checks → reviewed staging → production → reconciliation. No unrelated earnings work or historical payment corrections are included.

## Verified defects and sources

- Paystack Live had `/api/payment/webhook`, which returns 404 and has no application handler. The owner saved the correct `/api/paystack/webhook` destination. A valid signed delivery remains to be observed; browser GET 405 does not test delivery.
- Abandoned-checkout recovery and adaptive payment-link reminders independently sent requests for the same booking one second apart. Both relied on operational `pending_payment` without checking Paystack at dispatch.
- Deferred emails replayed stored payloads without rereading payment status; SMS fallback could follow an obsolete email attempt.
- Payment-confirmation orchestration selected `bookings.user_id`, absent from the current production schema, and ignored the query failure. The real row uses `customer_id`. The resulting sparse template showed Pending date/reference and omitted address/name.
- Missing `ADMIN_NOTIFICATION_EMAIL` prevented office notification. The owner explicitly chose the production fallback inbox above. Staging/local never inherit it.

## Implementation and acceptance

1. All current payment-link delivery paths and legacy recovery/expiry jobs read current booking/ledger evidence, verify the exact reference at Paystack, and reread the booking before sending. Confirmed paid, monthly, changed references, reversed or in-flight charges and uncertain lookups suppress payment requests. Uncertain deferred/legacy jobs retain bounded retry behavior. No financial settlement is invented by this check.
2. Both first-reminder paths and legacy reminders share a database-unique claim in the existing notification idempotency table. The final reminder is a separate event. Failed deliveries release their claim; claim errors suppress sending. Abandonment recovery sends SMS only after email is missing/fails.
3. Confirmation queries resolve the actual customer ownership column, include persisted customer name/contact, and report load failures rather than sending fabricated booking details. Existing row/snapshot presentation helpers and template variables remain canonical.
4. All office notification paths use one validated recipient resolver. Explicit environment configuration wins; the approved fallback is restricted to the production deployment. Multi-inbox delivery retains explicit To/Bcc handling.

## Verification and release evidence

- Local required checks: critical suite (1,210 tests before the final additional office regression), TypeScript, core lint and focused lint pass.
- Behavior regressions cover gateway success before booking finalization, captured ledger rows, monthly/cancelled bookings, reference replacement, unavailable gateway/DB, concurrent claims, deferred sends, payment during email/SMS fallback, legacy expiry, actual notification payload and template variables.
- Production schema was inspected read-only: canonical booking ownership and existing `(reference,event_type,channel)` / `(booking_id,event_type,channel)` unique claims are available. No migration is required.
- Broader optional notification tests expose two pre-existing `communicationPolicy` assertions that also fail in the unchanged baseline checkout. Their implementation/test files are untouched; these are not required CI gates.
- Repository CI and independent automated review are required on the final PR head. Staging activation, live SHA, synthetic/read-only checks and production promotion remain pending at this source commit. Record their evidence on the PR without claiming delivery from endpoint reachability alone.

## Recovery and boundaries

Rollback is a code revert through the same automatic branch deployment path. Existing financial records, gateway charges, payout history and notification history are retained. Dedupe claims are audit evidence; no bulk clearing is part of the release. No customer is charged and no extra customer confirmation is sent as a test. Any unresolved real gateway payment is routed to operational review, not silently marked paid.

Engineering implementation is prepared; formal release assurance is NOT ASSESSED until independent CI/review and staging evidence are available.
