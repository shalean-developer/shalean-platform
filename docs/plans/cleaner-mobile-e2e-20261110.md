# Shalean Cleaner Mobile — end-to-end delivery workstream

Status: In progress — discovery and implementation branch only. No production activation.
Branch: `feature/cleaner-mobile-e2e-20261110`
Scope: one Expo cleaner app for employed and independent cleaners, using the existing Shalean web API and Supabase authorization.

## Confirmed existing architecture
- `apps/mobile`: Expo 53 / React Native 0.79 / Expo Router cleaner app.
- `apps/customer-mobile`: separate Expo 54 customer client; do not conflate their release trains.
- `apps/web`: Next.js API authority, including `/api/cleaner/dashboard`.
- `packages/api-client`, `packages/mobile-ui`, `packages/types`, `packages/validation`: reusable packages.
- Existing dispatch semantics in `apps/web/lib/dispatch/assignmentLifecycleContract.ts`: pending offers, accepted/rejected/expired responses, booking vs dispatch state distinctions.
- Existing earnings reconciliation and payout controls: do not create a second disbursement rail.

## Required implementation and verification
1. Inventory current mobile routes, components, services, auth, session handling, deep links, and tests. Record each as implemented/partial/missing with file references.
2. Inventory cleaner API routes, identity mapping, RLS policies and database constraints. Verify authorization with native PostgreSQL tests.
3. Model cleaner engagement type separately from permissions and employment/payment policy; confirm the actual schema before migration. Existing cleaners must remain valid.
4. Employee path: invited/approved sign-in, assigned jobs, schedule, check-in, completion, read-only earnings.
5. Independent path: application, approval gate, eligible offers, atomic acceptance/rejection, availability, same execution flow, read-only earnings.
6. Mobile UI: home, jobs/offers, schedule, earnings, profile/settings, notifications; consistent safe-area layout and accessibility.
7. Job lifecycle: customer information only for authorized assignments, check-in, progress, incident report, photo uploads with access controls, idempotent completion.
8. Notifications: token registration and revocation, delivery and deep-link tests, no real customer sends from staging.
9. Offline: read-only cached assignments, explicit stale-state indication, safe queued writes with server idempotency and conflict resolution.
10. Quality: typecheck, lint, tests, backend critical suite, native PG authorization tests, build smoke, EAS Android preview artifact, physical Samsung acceptance; iOS build separately when signing is available.

## Release invariants
- No direct client service-role access or privileged keys.
- No cross-cleaner/cross-customer data leakage.
- No double-acceptance or duplicate payout; all financial status is authoritative on the backend.
- No customer-facing outbound notifications in tests.
- No production deployment, payout transfer, or database migration without explicit release approval.
- Preview APK must have a verified artifact and compatible signing/application ID before owner install.

## Acceptance journey
Employee: invite -> verify -> sign in -> view assignment -> navigate -> start -> complete -> earnings.
Independent: apply -> admin approve -> sign in -> receive eligible offer -> accept -> execute -> earnings.
Negative cases: rejected applicant, revoked cleaner, expired/contended offer, offline/retry, unauthorized booking, cancelled booking, duplicate completion, photo access denial.

## Initial findings / open audit
The mobile README is still the Expo starter README; replace with actual project setup after inspecting all routes.
Cleaner mobile uses Expo 53 while customer mobile uses Expo 54; upgrade only after dependency/build compatibility testing.
Existing `/api/cleaner/dashboard` and dispatch code can be reused; full mobile/API feature parity is not yet verified.
