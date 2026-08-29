# RD-P06E — Booking detail + customer actions

Status: IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06e-base` @ `c63c1b9e9a8617086396f8e9be321cc1fdbfd58e` (RD-P06D closure head)
Runtime implementation head before this audit record: `83ca0f8dd833135f3bb9085f38cbee8911945e34`
Scope: presentation-only normalization of `/account/bookings/[id]` and its customer action/dialog presentation. No production deployment, Supabase mutation, booking ownership change, API/query contract change, cancellation/rescheduling rule change, rebook/review eligibility change, stored pricing/payment authority change, analytics payload change, auth/RBAC change, or customer-data mutation.

## Governing authority

RD-P06A defines `/account/bookings/[id]` as the high-risk customer booking-detail/action surface and approves **RD-P06E — Booking detail + customer actions** after RD-P06D.

RD-P06E may normalize detail hierarchy, booking summary, timeline, cleaner, pricing, support and action grouping/dialog presentation while preserving cancellation eligibility/semantics, rescheduling rules, pricing authority, rebook behavior, review eligibility, booking ownership and analytics payload authority.

The repaired platform remains the business-logic authority. The Shalean Global Reusable UI System remains the presentation/component authority.

## Preserved business/data authority

RD-P06E does not change:

- `useBookingDetail()` fetching or the booking-detail API/data contract;
- customer booking ownership or visibility;
- `customerAccountBookingReference()` reference authority;
- `formatBookingWhen()` / `formatBookingLocation()` display inputs;
- `customerPreferredDispatchNotice()` dispatch-state semantics;
- `customerBookingTimelineForBooking()` timeline authority;
- `canCustomerModifyDashboardBooking()` modification eligibility;
- `dashboardBookingCustomerSurface()` rebook visibility;
- `leaveReviewHrefForBooking()` review eligibility/destination;
- query-string `?action=reschedule` / `?action=cancel` opening behavior;
- same-billing-month reschedule guard via `rescheduleCrossMonthBlocked()`;
- valid reschedule slots via `filterBookableTimeSlots()`;
- cancellation copy via `customerCancelBookingHint()`;
- cancellation and rescheduling mutations supplied by `useBookingDetail()`;
- invoice-closed cancellation disablement;
- stored checkout/payment price lines and totals;
- stored-price validation/alignment logic or `trackBookingPriceBreakdownShown()` analytics payload;
- cleaner/contact data or WhatsApp destination construction;
- AccountShell/AccountNav or customer role guard;
- production configuration/data.

No real cancel/reschedule/rebook/review/payment/support mutation is authorized during RD-P06E validation.

## Runtime file changed

- `apps/web/app/(ui-redesign)/account/bookings/[id]/page.tsx`

No API route, hook, booking-domain helper, pricing/payment helper, analytics helper, auth/RBAC file, Supabase client/query, migration or database file is changed.

## Presentation normalization

### Booking detail hierarchy

- preserves the canonical AccountShell and its existing `<main>` landmark;
- normalizes the page header and Back-to-bookings action for desktop/mobile containment;
- normalizes loading and error presentation with semantic Card/token treatment and `role="alert"` for load failure;
- keeps the existing booking-not-found EmptyState behavior;
- keeps preferred-dispatch copy while presenting it as a non-destructive status notice;
- shifts the wide layout to a primary detail column plus a bounded 20rem summary/action rail at XL widths, with normal document-flow stacking below that breakpoint;
- adds `min-w-0` / wrapping containment to long location, detail, cleaner and price content.

### Booking information cards

- preserves the canonical customer booking status badge and booking-detail data attributes;
- normalizes date/time/location icon roles to semantic `primary` tokens;
- composes Rooms and Extras in a responsive two-column card without changing their source arrays;
- retains Clean details and Access & arrival labels/values unchanged while improving responsive wrapping;
- preserves the booking timeline steps and ordering while replacing hard-coded blue/red presentation with semantic `primary` / `destructive` roles.

### Pricing, cleaner and support

- preserves every price line, amount, total and checkout-lock message source;
- normalizes price layout and total emphasis with semantic tokens;
- preserves cleaner name/phone/initials and the assigned/unassigned copy;
- keeps the existing telephone destination and improves keyboard focus/wrapping;
- keeps the existing WhatsApp number/message construction and brand treatment.

### Customer actions

- groups existing conditional actions inside one `Manage booking` Card;
- preserves the exact eligibility gates for Reschedule, Cancel booking, Rebook this clean and Leave review;
- preserves invoice-closed cancellation disablement;
- preserves all action destinations and mutation handlers;
- uses semantic destructive presentation for cancellation without changing its behavior.

### Dialogs and fields

- preserves both existing Dialog contracts and open/close state;
- preserves cancel confirmation copy and mutation flow while using the shared destructive Button variant;
- replaces route-local Label wrappers in the reschedule dialog with the shared presentation-only `FormField` primitive;
- preserves the date minimum, same-month coercion, available-slot options, save-disable rule, busy states and mutation handler exactly;
- keeps the cross-month warning text and validation behavior.

## Validation requirements

RD-P06E remains open until all applicable gates pass:

1. validation PR diff remains limited to the governed booking-detail presentation/audit files;
2. exact-head `web-test` passes;
3. exact-head `migration-governance` passes;
4. local desktop `/account/bookings/[id]` visual confirms detail hierarchy, price/cleaner/action rail, timeline and long-content containment;
5. local mobile `/account/bookings/[id]` visual confirms stacked cards/actions, readable status/price/detail content and mobile bottom-nav clearance;
6. non-mutating visual checks confirm the **Reschedule** and **Cancel booking** dialogs open and remain contained at desktop/mobile widths;
7. no Save/Yes-cancel action is submitted during presentation validation;
8. rebook/review/support actions are visually checked only when present; no real downstream mutation/payment is performed;
9. keyboard/focus/label/error semantics remain usable for touched controls;
10. after exact-head CI and local visual approval, closure evidence is recorded and the validation PR is closed **without merge**.

## Current decision

RD-P06E is **IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING**.
