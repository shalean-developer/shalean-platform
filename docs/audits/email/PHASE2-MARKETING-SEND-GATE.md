# Shalean Email Marketing Phase 2 — source-only review

Repository: shalean-developer/shalean-platform
Branch: audit/email-marketing-consent-phase2-20261104
PR: #1074 (Draft, DO NOT MERGE OR DEPLOY)

## Scope prepared
- Explicit affirmative consent event ledger; no historical opt-in is inferred.
- Append-only, RLS-protected ledger; anon/authenticated grants revoked.
- Authenticated customer account marketing preference API with explicit opt-in.
- Signed HMAC 90-day one-click unsubscribe tokens; GET displays confirmation without mutation, POST withdraws.
- Promotional referral/rebooking headers: List-Unsubscribe and List-Unsubscribe-Post.
- Local CRM withdrawal recorded before Resend update; failed provider synchronisation does not undo opt-out.
- Private durable unsubscribe-only reconciliation queue and unscheduled CRON_SECRET-protected retry route.
- Signed Resend contact.updated (unsubscribed=true) events mirrored into local withdrawal evidence, with duplicate-event replay.
- Promotional send gate uses local/Resend suppression and positive consent, denies on unknown/error.
- Generic transactional delivery no longer automatically registers Resend marketing audience contacts.
- Vitest negative-path tests in apps/web/lib/email/__tests__ and isolated PostgreSQL security assertions in supabase/tests.

## Release blockers and limits
- **No migration executed:** SQL security tests prepared only; must run against an isolated PostgreSQL schema and verify native ownership/trigger policies.
- **CI:** latest-head web-test/typecheck/security/migration checks must complete successfully; queued is not passed.
- **Consent UI and verification:** authenticated API exists, but actual customer UI, email-confirmation and final marketing wording need owner/product review.
- **Resubscription:** previously unsubscribed users are not automatically re-enabled. A verified re-subscribe flow remains out of scope.
- **Provider webhook:** code prepared, but live Resend webhook remains disabled. Isolated signed event/replay tests are required.
- **Reconciliation worker:** route exists only as unscheduled source and has not been invoked; test 429/5xx/rate limits/concurrency.
- **Customer correctness:** test guest recipients, profile email mismatches, booking transactional pathways and review requests; audit any other promotional send paths.
- **Privacy and security:** validate token origin/expiry, no side-effect on GET, signed POST, stale suppression, audit replay, and any missing RLS grants.
- **Mail:** never send any real email or invoke Resend writes during CI.

## Non-actions
No emails sent, live Supabase rows changed, Resend configuration updated, webhook activated, schema migrated, branch merged, or site deployed.

## Acceptance sequence
Latest head CI -> isolated native PostgreSQL security -> synthetic end-to-end negative cases -> staging-only authorised preview -> owner acceptance -> separate merge/deploy approval.
