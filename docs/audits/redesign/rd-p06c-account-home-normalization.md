# RD-P06C — Account home normalization

Status: IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06c-base` @ `006bb3a36a4df92487d4e4b2df89af43357785c1`
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

## Validation gate

RD-P06C can close only after:

1. base-to-head diff remains Account Home presentation + reusable TrustBar + audit/validation only;
2. exact-head migration governance passes;
3. exact-head standard web CI passes, including typecheck, payment/referral/revenue regressions, production build and crawl;
4. local desktop `/account` visual confirms quick actions, upcoming state, monthly overview, recent bookings and secondary rail are aligned with no shell regression;
5. local mobile `/account` visual confirms readable quick-action/trust content, sensible stacking, no horizontal overflow and no bottom-nav overlap;
6. no production deployment or production-data/Supabase mutation is performed;
7. validation PR is closed without merge after final exact-head closure evidence.

## Current decision

RD-P06C is implemented but **not closed** until exact-head CI and local desktop/mobile visual validation pass.
