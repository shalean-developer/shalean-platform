# RD-P06D — Customer bookings list normalization

Status: IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06d-base` @ `b4b31c04305b5cf0b58aa2e8feda6b0c4aec3e12` (RD-P06C closure head)
Runtime implementation head before this audit record: `4283037b6b913aca9f32c28f72fa16ebeb80bf4d`
Scope: presentation-only normalization of `/account/bookings`. No production deployment, Supabase mutation, booking ownership change, API/query contract change, cancellation/rescheduling behavior change, review eligibility change, payment/invoice mutation, auth/RBAC change, or customer-data mutation.

## Governing authority

RD-P06A defines `/account/bookings` as the customer bookings list/history surface and explicitly approves **RD-P06D — Customer bookings list normalization** after RD-P06C.

RD-P06D may normalize page header, cards/table switcher, tabs, status presentation, review prompts, paging chrome, side actions, and empty/error/loading states while preserving the current booking-fetch/API contract and all customer modification/review semantics.

The repaired platform remains the business-logic authority. The Shalean Global Reusable UI System remains the presentation/component authority.

## Preserved business/data authority

RD-P06D does not change:

- `useBookings()` or `/api/customer/bookings`;
- the existing client-side five-item presentation pagination contract;
- upcoming/past classification via `isUpcomingBookingRow()`;
- booking sorting semantics;
- customer modification eligibility via `canCustomerModifyDashboardBooking()`;
- cancellation or rescheduling mutations supplied by `useBookings()`;
- review eligibility via `isBookingPendingCustomerReview()` and `leaveReviewHrefForBooking()`;
- dashboard summary calculations or money formatting;
- booking ownership, status derivation, payment state, invoice state, or stored booking data;
- `BookingCard` booking behavior;
- account shell/navigation or customer role guard;
- production configuration/data.

Server-side customer-booking pagination/query-cost work remains separate SR/functional authority and is intentionally not implemented by RD-P06D.

## Runtime files changed

- `apps/web/app/(ui-redesign)/account/bookings/page.tsx`
- `apps/web/components/dashboard/customer-bookings-table.tsx`
- `apps/web/components/account/AccountPagination.tsx` (new reusable presentation component)

No API route, hook, Supabase query/client, booking mutation helper, pricing/payment helper, ownership helper, auth/RBAC file, or database file is changed.

## Presentation normalization

### Bookings page

- keeps the canonical AccountShell and existing route hierarchy;
- normalizes the page header and Book a clean action through shared semantic tokens and `Button`;
- adds semantic `role="alert"` treatment to booking/review load errors without changing retry behavior;
- preserves the pending-review prompt, review count, first eligible booking behavior, and existing destinations while composing the prompt with shared `Card`/`Button` primitives;
- preserves the cards/table view choice while expressing it as an accessible pressed-button group using the shared `Button` primitive;
- normalizes Upcoming/Past tabs using semantic border/card/primary roles;
- preserves current upcoming/past counts and local five-item pagination semantics;
- normalizes upcoming/past empty states through the shared `Card`/`Button` primitives;
- preserves `BookingCard` instances, cancel/reschedule handlers, detail destinations, and review links;
- keeps the TrustBar and existing account assurance content;
- keeps month summary, quick links, and HelpCard in the secondary rail on wide screens and normal document flow on smaller screens;
- improves focus-visible treatment and wrapping/containment of quick links;
- uses semantic `foreground`, `muted-foreground`, `card`, `border`, `primary`, `accent`, `destructive`, `muted`, and `ring` roles where appropriate.

### Reusable account pagination

`AccountPagination` replaces the route-local pagination chrome while preserving the exact page/pageCount/onPage behavior.

It adds:

- shared previous/next `Button` treatment;
- explicit pagination labels;
- page-change button labels;
- an `aria-live` page indicator;
- responsive wrapping without altering pagination calculations or data loading.

### Customer bookings table

- preserves horizontal overflow containment and the existing 720 px minimum table width;
- preserves columns, booking notes, modification eligibility, status badge authority, detail/reschedule/cancel/review destinations;
- normalizes table surfaces/text/dividers/actions to semantic design tokens;
- does not change table data, row ordering, or action availability.

## Validation requirements

RD-P06D remains open until all applicable gates pass:

1. validation PR diff remains limited to the governed presentation/audit files;
2. exact-head `web-test` passes;
3. exact-head `migration-governance` passes;
4. local desktop `/account/bookings` visual confirms header, tabs, card view, table view, pagination, review prompt, sidebar and empty/error/loading containment without shell regression;
5. local mobile `/account/bookings` visual confirms readable tabs/view controls, booking-card containment, horizontally contained table view, side content stacking and bottom-nav clearance;
6. keyboard/focus/error semantics remain usable for the touched controls;
7. no real cancellation, rescheduling, booking mutation, review submission, payment, support-case mutation, production deployment or Supabase/data mutation is performed during presentation validation;
8. after exact-head CI and local visual approval, closure evidence is recorded and the validation PR is closed **without merge**.

## Current decision

RD-P06D is **IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING**.
