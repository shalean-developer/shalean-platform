# RD-P06I — Customer account closure audit

Status: **COMPLETED — customer account closure passed**
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06i-base` @ `6c560550783060b11433252e9c082ce85bc8e48d`
Scope: closure audit/evidence only. No production deployment, Supabase mutation, booking/payment/profile/support-case mutation, auth/RBAC change, pricing change, or new redesign implementation is authorized.

## Decision

RD-P06B through RD-P06H form a coherent, sequential, presentation-only validation chain and their governed customer-account UI surfaces have passed their applicable desktop/mobile/non-mutating validation gates.

The final RD-P06I local closure smoke was reported **Pass** on 2026-08-29. Exact-head CI for the audit head also passed both `migration-governance` and `web-test` before this closure-record update.

**RD-P06 is therefore complete from the redesign/customer-account programme perspective.**

A pre-existing database migration filename-order risk was discovered during the audit and is retained below as a separate functional/database follow-up. It is not classified as an RD-P06 presentation regression and does not reopen the completed redesign surfaces after the successful current-environment account smoke.

## Closed slice chain

| Slice | Validation PR | Closure head | Result |
| --- | --- | --- | --- |
| RD-P06B — Account shell + navigation | #460 | `006bb3a36a4df92487d4e4b2df89af43357785c1` | Closed unmerged |
| RD-P06C — Account home | #464 | `b4b31c04305b5cf0b58aa2e8feda6b0c4aec3e12` | Closed unmerged |
| RD-P06D — Customer bookings list | #467 | `c63c1b9e9a8617086396f8e9be321cc1fdbfd58e` | Closed unmerged |
| RD-P06E — Booking detail + actions | #468 | `30aa81367d0e392afa010f99d549521da0c6089d` | Closed unmerged |
| RD-P06F — Profile | #470 | `3a4184eed52c777ffe6dda5f661104117eebe69c` | Closed unmerged |
| RD-P06G — Invoices + payment history | #471 | `70eebb62201be55ba634efd27fbde2aea24ea365` | Closed unmerged |
| RD-P06H — Support surfaces | #472 | `6c560550783060b11433252e9c082ce85bc8e48d` | Closed unmerged |

Each later validation base was pinned to the previous slice closure head. No validation PR was merged.

## Closure checks passed

### Canonical account frame and access

- `apps/web/app/(ui-redesign)/account/layout.tsx` still wraps customer-account routes in the canonical `AccountShell`.
- Account metadata remains `noindex` / `nofollow`.
- `AccountShell` remains the sole customer-role guard owner via `useRoleRouteGuard({ requiredRole: "customer" })`.
- `AccountShell` remains the canonical account `<main>` landmark owner.
- Desktop sidebar, account header and mobile navigation remain centralized in `AccountNav`.
- Existing navigation hrefs, active-route semantics, sign-out, notifications, support cases, profile and WhatsApp destinations remain preserved.

### Governed surface evidence

- `/account` — desktop/mobile passed.
- `/account/bookings` — Cards/Table, Upcoming/Past, populated/empty and mobile containment passed.
- `/account/bookings/[id]` — desktop/mobile detail plus non-mutating Cancel/Reschedule dialog containment passed.
- `/account/profile` — desktop/mobile passed without submitting profile/password changes.
- `/account/invoices` — desktop/mobile empty state passed.
- `/account/payments` — desktop/mobile populated payment-history state passed without initiating payment.
- `/account/invoices/[invoiceId]` — conditional fixture gate was unavailable and therefore not exercised.
- `/account/help` — desktop/mobile plus search, category filter and FAQ disclosure passed.
- `/account/cases` — final current-environment non-mutating closure smoke reported **Pass**.

### Preserve-only route compatibility

The following preserved routes still exist on the redesign branch and were not replaced by RD-P06 implementation:

- `/account/addresses`
- `/account/recurring`
- `/account/reviews`
- `/account/referrals`
- `/account/rewards`
- `/account/notifications`
- `/account/book` → preserves redirect to `/book`

## Separate follow-up risk — migration filename ordering

`apps/web/app/api/customer/cases/route.ts` is identical on `design/rd04-platform-redesign` and `integration/shalean-repairs`. It resolves the signed-in user through canonical `public.customers` first, then queries `customer_care_cases` with legacy compatibility.

The repository contains:

- `supabase/migrations/20260809023000_canonical_customers.sql`
- `supabase/migrations/20260809235000_customer_care_cases.sql`

The canonical-customer migration includes an `alter table public.customer_care_cases ...` statement even though the later filename creates that table. A clean filename-ordered replay therefore deserves a separately governed database repair/check.

The historical merge sequence explains why the already-evolved/live schema can still be valid:

1. PR #255 — Customer Care Case Management — merged 2026-08-08, creating the case ledger.
2. PR #258 — Canonical Customer CRM identity — merged 2026-08-09, adding canonical customer identity and CRM linkage.

### Classification

- **Not an RD-P06 presentation regression.**
- Current customer-account closure smoke: **Pass**.
- Existing/live migration sequence had Customer Care before canonical CRM.
- Clean filename-replay ordering remains a functional/database maintenance risk to address separately.
- RD-P06I did not edit or apply any migration.

## RD-P06I verdict

**COMPLETED — RD-P06 customer account programme closure passed.**

The customer-account redesign from RD-P06B through RD-P06H is internally coherent, validated, and closed. The migration-order observation is handed off as a separate database-maintenance concern and does not change the RD-P06 redesign verdict.