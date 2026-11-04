# Phase 2 marketing email remediation — DRAFT / DO NOT MERGE

Branch: `audit/email-marketing-consent-phase2-20261104` | PR #1074

## Implemented in branch
- Append-only-intended consent event ledger migration (source-only, NOT applied; migration governance pending).
- Fail-closed marketing-only decision and database reads for positive consent, CRM unsubscribe, local suppression, verified customer identity.
- Read-only per-send Resend contact and suppression GET checks. Provider failure/404 contact denies marketing. These checks do not send emails.
- Marketing gates for referral campaign direct/cron sends, lifecycle rebook jobs and direct rebooking send functions, and tagged marketing retries through safeResendSend.
- Decoupled transactional delivery from automatic Resend audience contact enrollment.
- Unsubscribe-only Resend PATCH primitive (not wired to a public endpoint; no subscribe operation).
- Isolated negative-path test files for eligibility, provider lookup, unsubscribe reconciliation.

## Blocking work before merging/deploying
1. Implement a verified opt-in/opt-out capture API with identity proof, CSRF protection and append-only audit; consent is NOT inferred from existing customers.
2. Test and complete a durable CRM-first unsubscribe workflow that cannot allow mail during provider sync failures. Reconcile legacy Resend unsubscribes back to CRM.
3. Verify migration naming/schema references and PostgreSQL security with native tests; no migration applied.
4. Verify all other promotional templates/paths and retries; classify service review email content and admin test sends separately.
5. Run full latest-head CI, TypeScript typecheck, source integration tests, and staging synthetic checks.
6. Test failure behavior for provider 429/5xx, latency, stale data, unknown identity and idempotency; no provider writes during testing.

## Safety
No emails, Resend settings, Supabase rows, deployed services or production sites changed. PR is draft, unmerged, undeployed.
