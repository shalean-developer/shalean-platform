# Cleaner mobile onboarding and authorization audit — 2026-11-10

## Verified source paths
- Mobile sign-in: `apps/mobile/app/(auth)/sign-in.tsx`, `features/auth/SignInForm.tsx`, `providers/AuthProvider.tsx`.
- Application intake: `apps/web/app/api/cleaner/apply/route.ts` (public POST; pending application).
- Application approval: `apps/web/app/api/admin/cleaner-applications/[id]/route.ts` (admin PATCH).
- Cleaner profile: `apps/web/app/api/cleaner/me/route.ts` (authenticated GET/PATCH).
- Workforce navigation: `apps/mobile/app/(cleaner)/(tabs)/_layout.tsx` (Today, Schedule, Earnings, Profile).

## Findings
1. Existing public application flow accepts name, phone, city, location, working areas/days; duplicate pending/approved applications are rejected. Reuse this flow.
2. Approval creates a cleaner account with a generated temporary password and calls onboarding/approval WhatsApp helpers. **Open verification:** prove that onboarding actually delivers usable credentials or a secure activation path; do not assume it does.
3. The reviewed intake and approval endpoints do not establish a distinct employed-vs-independent engagement classification. **Design gate:** inspect full schema and employment/payout policy before introducing the distinction. Do not infer employment type from whether someone self-applied.
4. Mobile login currently uses phone/password and requires `/api/cleaner/me` to resolve a cleaner profile.
5. The cleaner profile GET previously used a 15-second private HTTP cache. Branch change sets no-store; test with two cleaner sessions.
6. Mobile tabs already exist and should be reused.
7. Offline queue actions and photo files were not automatically scoped to identity. Branch changes purge them on account change and warn before sign-out; still test in-flight sync races and interrupted recovery.
8. Independent cleaner self-service activation and employment-specific dispatch/pay policy are **not proven** by these source paths.

## Required acceptance tests
- Pending or rejected applicant cannot sign in as an approved cleaner.
- Approved cleaner receives a usable secure activation method; no passwords leaked in logs or URLs.
- Employee and independent cleaner permissions and payout policies are enforced server-side.
- Two cleaner identities on the same device cannot see each other's cached jobs, photos or queued writes.
- Concurrent offers, expiry, revoked accounts and retrying queued actions cannot bypass assignment checks.
- Cleaner profile responses are never reused across authenticated users by HTTP caches.
- No real outbound customer messages or payout transfers in staging tests.

Status: findings and implementation gates; no test-pass claim.
