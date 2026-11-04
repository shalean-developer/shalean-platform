# Phase 2 marketing-only consent gate — DRAFT / DO NOT DEPLOY

Branch: audit/email-marketing-consent-phase2-20261104

The branch introduces an append-only affirmative consent ledger, a pure decision function, and a marketing-only database guard.

## Deliberate launch blocker
Provider preferences and suppressions are not yet mirrored into a freshness-verifiable local table. MarketingSendGate therefore reports providerStateFresh=false and denies **every** marketing send. This is intentional and **must not be merged or deployed** until provider reconciling and full regression tests have passed. An absent consent table also denies sending safely.

## No scope expansion
Do not gate transactional security codes, password resets, booking confirmations, payment notices, or service review requests with affirmative marketing consent. No consent data is inferred or backfilled from historical bookings.

## Remaining work before approval
- Establish verified customer-ID/email ownership for historical and guest recipients.
- Create production-ready, authenticated consent capture and unsubscribe paths with append-only evidence and user-scope protections.
- Implement bidirectional provider contact reconciliation using Resend's PATCH contact API, provider suppression reads, freshness and explicit conflict policy; ensure transactional sends do not auto-subscribe.
- Replace the intentionally closed provider-state placeholder after tests.
- Cover all marketing send and retry entry points; verify idempotency, no duplicate sends, no unexpected blocking of transactional emails.
- Run repository test suite, CI, staging verification and owner release approval separately.

No migration has been applied and no provider is contacted by this branch.
