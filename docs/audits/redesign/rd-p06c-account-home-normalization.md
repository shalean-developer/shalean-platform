# RD-P06C — Account home normalization

Status: IMPLEMENTED — CI PASSED / LOCAL VISUAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06c-base` @ `006bb3a36a4df92487d4e4b2df89af43357785c1`
Validated implementation head: `d9cd55f924b1ed5b8741f5f588e33d55a89ff62f`
Validation PR: #464 — draft, validation only; close unmerged after final local visual approval and exact-head closure evidence.
Scope: presentation-only normalization of `/account`. No production deployment, Supabase mutation, auth/RBAC change, booking mutation, invoice/payment-state change, property mutation, support mutation, or customer-data authority change.

## Governing authority

RD-P06A defines Customer Account as the RD-P06 programme surface and RD-P06B established the canonical Account shell/navigation. RD-P06C is limited to the Account Home page body and reusable Account Home assurance presentation.

The Shalean Global Reusable UI System requires reuse-first composition, semantic global tokens, shared Card/Button primitives, responsive containment and accessibility as an acceptance criterion. Repaired platform business logic remains authoritative.

## Baseline authority audit

The `/account` route is implemented by:

- `apps/web/app/(ui-redesign)/account/page.tsx`

Its existing data/business authority is retained:

- `useDashboardSummary()` remains the sole source for next booking, recent bookings, month counts/hours/spend, per-visit invoices, monthly invoice state and overdue state;
- `useAddresses()` remains the source for customer property data;
- `formatZarFromCents()` remains the money display helper;
- `customerMonthlyInvoiceStatusLabel()` remains the monthly invoice status-label authority;
- `invoiceOverdueEscalationText()` remains the overdue-message authority;
- `CustomerBookingStatusBadge` remains the booking-status presentation authority;
- `BookingCard` remains the recent-booking presentation/contract consumed by Account Home;
- all existing route destinations and booking/invoice/property/support actions are preserved.

RD-P06C does not repair, reinterpret or replace any of those contracts.

## Runtime files changed

- `apps/web/app/(ui-redesign)/account/page.tsx`
- `apps/web/components/account/TrustBar.tsx`

No hook, API route, Supabase client/query, booking mutation, invoice/payment helper, role guard, profile write path, support API or Booking V2 runtime file is changed.

## Presentation normalization

### Account Home page

- uses the canonical shared `Card` and `Button` primitives rather than repeated page-local card chrome;
- uses semantic `foreground`, `muted-foreground`, `card`, `border`, `primary`, `destructive`, `accent` and global radius/shadow roles where appropriate;
- keeps the existing four quick actions and destinations but removes forced one-line truncation;
- quick actions are one column below 360 px, two columns at normal mobile widths and four columns on desktop;
- preserves the existing Upcoming Booking content and View details destination while improving wrapping/containment;
- preserves the existing empty upcoming-booking state and Book a clean destination;
- consolidates repeated month-stat card presentation through an internal presentation-only `StatCard` renderer;
- preserves every existing month metric and its value source;
- preserves the existing Recent bookings list and `BookingCard` instances without changing booking logic;
- keeps invoice, property and support summaries in the secondary rail on wide screens and in document flow on smaller screens;
- improves focus-visible treatment on page links/actions;
- adds semantic alert roles to page/address error presentation without changing retry/error behavior;
- keeps the existing responsive ordering of Account Home content.

### TrustBar

- now consumes the shared `Card` primitive and semantic text/border roles;
- removes forced truncation of assurance labels/copy;
- switches to one column below 360 px, two columns at standard mobile widths and four columns on wide screens;
- preserves the exact four assurances and their meaning.

## Explicitly preserved behavior

RD-P06C does not change:

- customer role/access verification or the existing role-guard timeout banner;
- AccountShell or AccountNav;
- booking visibility, status derivation, scheduling, cancellation, rescheduling or rebooking;
- recent-booking selection/count semantics;
- dashboard summary fetching/realtime/data calculations;
- invoice generation, invoice status, overdue calculations, balances or payment behavior;
- address/property fetching or writes;
- WhatsApp/support destination or support-case behavior;
- auth/session/Supabase behavior;
- any production configuration or data.

## Diff-scope proof

Comparison from `006bb3a36a4df92487d4e4b2df89af43357785c1` to implementation head `d9cd55f924b1ed5b8741f5f588e33d55a89ff62f` contains exactly three files:

1. `apps/web/app/(ui-redesign)/account/page.tsx`
2. `apps/web/components/account/TrustBar.tsx`
3. `docs/audits/redesign/rd-p06c-account-home-normalization.md`

No AccountShell/AccountNav, hook, API, Supabase, booking/payment mutation, profile, property write or support API file is in the implementation diff.

## Exact-head CI evidence

### migration-governance

Workflow run: `33254682062`
Conclusion: **success**.

### web-test

Workflow run: `33254682134`
Job: `99106225287`
Conclusion: **success**.

The exact implementation head passed:

- PR-head SHA equality check;
- dependency audit;
- critical payment/referral tests;
- privileged Office email security contract;
- revenue-path tests;
- marketing/Meta compliance tests;
- blog governance;
- TypeScript typecheck;
- Booking core ESLint;
- SEO/canonical/Search Console readiness gates;
- production Next.js build;
- local production server start;
- internal-link crawl;
- location/compliance route matrix.

No production deployment or production-data/Supabase mutation was performed by RD-P06C.

## Remaining validation gate

RD-P06C remains open until:

1. this audit-only head reruns the exact-head repository guards successfully;
2. local desktop `/account` visual confirms quick actions, upcoming state, monthly overview, recent bookings and secondary rail are aligned with no shell regression;
3. local mobile `/account` visual confirms readable quick-action/trust content, sensible stacking, no horizontal overflow and no bottom-nav overlap;
4. no production deployment or production-data/Supabase mutation is performed;
5. after visual approval, final closure evidence is recorded and validation PR #464 is closed without merge.

## Current decision

RD-P06C is **implemented and CI-passed**, but remains **open pending audit-only exact-head CI and local desktop/mobile visual validation**.
