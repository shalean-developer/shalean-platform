# Restricted owner-inbox delivery — issue #1076

The owner requested fixing the missing real-inbox test action after confirming both customer accounts and explicitly subscribing. This change adds an Office button and POST `/api/admin/email/acceptance/send`. It does not activate general staging sends or modify Resend contacts.

## Scope and controls

- Exact staging environment, database, Host and private exactly-two-recipient configuration; existing system.settings/Office MFA gate; exact same-origin JSON request, bounded body and explicit per-message checkbox.
- Separate `MARKETING_ACCEPTANCE_SEND_ENABLED=true` capability. Requires normal outbound messaging and provider contact writes to remain disabled, plus dedicated staging webhook and unsubscribe secrets. Default is closed.
- Confirms customer email, current affirmative consent, CRM opt-out, local suppression and live provider preferences/suppression using the existing marketing send gate. Missing provider contact or unknown state fails closed; no automatic contact creation or re-subscription.
- Fixed subject and content, one recipient, staging-only links, HTML/text bodies, generation-signed visible unsubscribe and standard one-click unsubscribe headers. No caller-supplied message/template/identity.
- Durable unique reservation in the existing outbound ledger before contacting Resend. Stable server-generated primary key and provider idempotency key per customer/consent generation stop concurrent/replayed requests. A fresh explicit subscription advances generation and permits another deliberate test.
- Rechecks generation and eligibility after reservation. Provider-accepted, uncertain and failed outcomes remain separate. Every acceptance record has retry_status=blocked; ordinary recovery workers must never resend it automatically. An interrupted reservation or unknown outcome requires manual provider review. No new migration or live schema change.
- Dedicated webhook continues to verify signature, staging tag, exact recipient and matching local provider ID. An early callback retries until tracking exists. A tracking failure after acceptance is reported as review required and cannot induce a resend.

## Validation and release

Local source matches main baseline `2742dc5db638157e67de224227ff3aee273578dc` tree `269b5dba44576659e0e4954f14f839a38ce04a2a`, preserving concurrent cash-flow/booking changes. Local marketing regression: 325 tests / 35 suites PASS; sender/route/UI/retry focused checks: 57 PASS; typecheck and changed-file lint PASS. Existing PGlite isolated consent/security harness: 28 checks PASS (in-process PostgreSQL, not native two-session proof). Exact final-head CI must execute the tests, build/served checks and native PostgreSQL security/concurrency regressions before staging release.

Deploy source before activating the separate capability. Retain existing rollback directories and Plesk private startup loader. Verify exact staging identity and normal delivery/contact switches remain closed. Verify both inboxes' local consent and provider prerequisites; any missing provider enrollment is a separate reviewed operation, never a bypass in this sender. Enable only the dedicated staging webhook for actual event proof; production webhook remains unchanged.

Actual send is an explicit button action for one inbox at a time. Confirm provider acceptance, signed event persistence and actual inbox receipt separately. Test signed unsubscribe, replay, stale generation and explicit re-subscription with the owner. Neither a configured endpoint nor a provider-accepted response proves inbox receipt or full acceptance.

Rollback: set MARKETING_ACCEPTANCE_SEND_ENABLED=false and disable the dedicated staging webhook; restore prior runtime if necessary. Retain the outbound ledger and consent history. No production release is included.
