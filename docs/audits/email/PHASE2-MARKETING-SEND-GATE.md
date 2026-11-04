# Phase 2 — marketing consent and unsubscribe, DRAFT / DO NOT DEPLOY

Source branch: audit/email-marketing-consent-phase2-20261104 | PR #1074

## Source-only work prepared
- Immutable append-only marketing-email consent ledger migration, with RLS and no public/authenticated table privileges.
- Authenticated customer preferences POST using verified bearer identity and explicit opt-in; no historical consent backfill.
- CRM-first opt-out: append withdrawal evidence, update legacy CRM unsubscribe timestamp, then attempt Resend PATCH. Provider failure never reverses the local opt-out.
- Signed expiring HMAC unsubscribe URLs, GET confirmation without mutation, POST no-login unsubscribe and one-click headers on rebooking/referral marketing messages.
- Resend contact.updated=true signed-webhook handling for CRM withdrawal; replay after post-insert failures remains processable.
- Read-only Resend contact/suppression checks at marketing send time; unknown and provider outage deny.
- Transactional emails do not automatically enroll customers in marketing audiences.
- Native PostgreSQL security SQL and isolated negative-path tests added.

## DO NOT MERGE / release blockers
1. Native SQL security test must execute on a real isolated PostgreSQL schema after source-only migration rehearsal; never production.
2. Latest-head full CI, typecheck and marketing lifecycle/transactional/retry integration tests must pass. Tests present in source are not evidence they ran.
3. Safe durable provider reconciliation queue and retry worker are not implemented: the authenticated opt-out endpoint can return providerSync=retry_required; the local opt-out nevertheless remains authoritative.
4. Need explicit owner review of opt-in policy, legally suitable wording, email verification status, UI consent checkbox and no-login unsubscribe page content.
5. Ensure marketing opt-in/resubscribe policies do not lift prior CRM/Resend suppression; no re-subscribe automation.
6. Verify other marketing templates/senders, rate limits, provider 429/5xx, webhook replays/ordering, and HTTPS URL correctness before staging.
7. Resend webhook remains disabled until separate approval and staging verification.

## Safety
No live Supabase mutation, provider write, real email, webhook activation, deployment or merge was performed. PR remains Draft.
