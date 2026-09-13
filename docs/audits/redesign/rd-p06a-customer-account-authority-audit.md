# RD-P06A — Customer account authority + implementation audit

Status: COMPLETE — READY FOR IMPLEMENTATION SLICES
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06a-base` @ `08b149495c00e7a5044bc88511fb2785379dcce2`
Scope: customer-account audit and implementation authority only. No production deployment, production data mutation, Supabase mutation, booking/payment behavior change, customer ownership change, invoice/payment-state change, support-case mutation, auth/RBAC change, or pricing authority change.

## Programme authority

RD-P05 Booking UI is closed at `08b149495c00e7a5044bc88511fb2785379dcce2`. RD-P06 is user-authorized as the **Customer account** redesign stage.

The attached **Shalean Global Reusable UI System** is the presentation/component authority for this stage. Its reusable-component definitions apply to RD-P06; any older phase-number/build-order label in the workbook is historical and does not override the user-authorized RD-P06 stage name.

The reusable-system rules that govern this stage are:

- repaired `shalean-platform` business logic remains authoritative;
- reuse first — check the global reusable system before creating page-specific UI;
- canonical domain states must map through shared status presentation;
- all fields use shared FormField conventions for label/help/required/disabled/error states;
- keyboard, focus, labels, error semantics and screen-reader behavior are acceptance criteria;
- redesign stays isolated on `design/rd04-platform-redesign` while SR repairs continue;
- no redesign production merge until booking/payment/RBAC/customer/workforce regressions are green.

## Primary RD-P06 governed surfaces

RD-P06 governs the following customer-account presentation surfaces:

1. `/account` — Account home.
2. `/account/bookings` — Bookings list/history.
3. `/account/bookings/[id]` — Booking detail and customer booking actions.
4. `/account/profile` — Profile/contact/security presentation.
5. `/account/invoices`, `/account/invoices/[invoiceId]`, `/account/payments` — invoices/payment history.
6. `/account/help`, `/account/cases` and account-side action/support surfaces.

Adjacent routes such as `/account/addresses`, `/account/recurring`, `/account/reviews`, `/account/referrals`, `/account/rewards`, `/account/notifications` and `/account/book` are **preserve-only dependencies** unless separately added to RD-P06 scope. Their navigation and shell compatibility must not regress.

## Canonical account shell authority

`apps/web/app/(ui-redesign)/account/layout.tsx` wraps customer account routes with the existing `AccountShell` and marks the account surface `noindex`/`nofollow`.

`apps/web/src/features/account/AccountShell.tsx` is the canonical account frame. It currently owns:

- customer-role route guard integration;
- desktop account sidebar;
- account top bar;
- support-cases shortcut;
- page content container;
- checking/loading skeleton;
- mobile account navigation;
- account dashboard toast provider.

RD-P06 must **normalize this existing shell**, not introduce a parallel customer-account shell.

`apps/web/src/features/account/AccountNav.tsx` currently owns desktop navigation groups, desktop profile/logout affordances, sticky top bar, WhatsApp help, notifications entry point, avatar menu and mobile navigation.

## Reusable-system component map for RD-P06

The global reusable-system inventory identifies the following as the intended shared patterns for this stage:

### Customer-account navigation

- `AccountShell` — canonical customer account layout/navigation frame.
- `AccountSidebar`.
- `AccountHeader`.
- `AccountNav`.

### Global layout

- `PageContainer`.
- `PageHeader`.
- `PageHeaderActions`.
- `Section`.
- `SectionHeader`.
- `SectionActions`.
- `ContentGrid` / reusable sidebar layout where appropriate.

### Shared controls and states

- canonical `Button`, `Card`, `Badge`, `Tabs`, `Dialog`, `Input`, `PasswordInput`, `Select` and related primitives;
- shared FormField conventions for profile forms;
- shared loading, empty, error and retry states;
- shared status semantics;
- reusable pagination rather than route-local pagination chrome where the underlying data contract permits it.

### Existing account-domain components to compose before duplicating

Current platform components include:

- `AccountRouteLayout`;
- `HelpCard`;
- `InvoiceCard`;
- `PerBookingInvoiceCard`;
- `PropertyCard`;
- `StatCard`;
- `TrustBar`;
- existing dashboard booking cards/table/status badges and customer booking display helpers.

RD-P06 implementation should compose or normalize these before introducing page-specific visual duplicates.

## Business-logic authority that RD-P06 must preserve

### Customer identity and access

`AccountShell` uses `useRoleRouteGuard({ requiredRole: "customer" })`. RD-P06 must not replace, bypass or weaken this customer-role/access contract.

### Account home

`/account` consumes dashboard summary, customer addresses, booking/invoice state and existing booking/status helpers. RD-P06 may reorganize information hierarchy and visual presentation only; it must not invent new financial, booking, status or address authority.

### Bookings list

`useBookings()` is the current customer bookings authority in the account UI. It:

- reads `/api/customer/bookings`;
- maps booking rows through canonical dashboard booking mapping;
- subscribes to booking realtime changes for current ownership compatibility;
- exposes existing cancel and reschedule mutations.

`/account/bookings` currently performs local five-item presentation pagination after loading its booking set. RD-P06 must not redesign the API/pagination contract as a presentation change. Any server-side customer-booking pagination/query-cost repair remains separate SR/functional authority.

RD-P06 may normalize booking cards/table/tabs/paging presentation while preserving booking visibility, sorting, status, review eligibility and modification eligibility semantics.

### Booking detail and actions

`/account/bookings/[id]` is a high-risk action surface. It currently owns/presents:

- canonical customer booking detail mapping and reference display;
- stored checkout price breakdown display and associated analytics;
- booking timeline;
- cleaner/contact display;
- existing modification eligibility;
- same-billing-month reschedule guard and valid slot filtering;
- cancellation dialog/contract;
- rebook link behavior;
- leave-review eligibility/link;
- WhatsApp booking support action.

RD-P06 may redesign the hierarchy, cards, dialogs and action grouping but must not alter cancellation eligibility/semantics, rescheduling rules, pricing authority, rebook behavior, review eligibility, booking ownership or analytics payload authority.

### Profile

`/account/profile` is a write surface. It currently updates:

- Supabase Auth user metadata;
- `user_profiles` contact/profile fields;
- normalized South African phone/contact fields;
- date of birth;
- optional password change.

RD-P06 profile work is presentation-only. It must preserve field meaning, validation, normalization, update targets, success/error behavior and password requirements unless a separately authorized functional repair is opened.

### Invoices and payment history

`/account/invoices` combines monthly invoice state with per-booking invoice presentation and overdue handling. `/account/payments` derives payment-history rows from canonical customer booking/payment display helpers.

RD-P06 may unify billing information hierarchy and status presentation but must not change:

- invoice totals/balances/due dates;
- paid/pending/overdue authority;
- Paystack references or payment-state interpretation;
- refund-state semantics;
- invoice/payment navigation targets;
- payment initiation/confirmation behavior.

No real payment is authorized by RD-P06 validation.

### Support and cases

`/account/help` owns current FAQ/search/contact presentation. `/account/cases` reads formal customer support cases from `/api/customer/cases`.

RD-P06 may normalize help/case cards, search, status and contact/action presentation. It must not change case ownership, case API behavior, SLA timestamps/status semantics, support destinations or create/modify production cases during validation.

## Principal UI debt / redesign opportunity

The account is functional but visually fragmented:

- `AccountNav` hard-codes its own gray/blue/red/green presentation, radii, spacing and navigation states;
- pages repeat local page-title/description blocks rather than consistently using one `PageHeader` pattern;
- quick-action cards, stat cards, support cards, empty states and alert banners are composed differently route by route;
- several routes use route-local color/status treatments rather than one canonical semantic status system;
- profile fields do not yet consistently express the global FormField contract;
- bookings list owns route-local `Pagination` presentation;
- desktop/mobile shell behavior exists, but its visual system should converge with the global reusable UI system without changing access/navigation behavior.

## Approved implementation order

### RD-P06B — Account shell + navigation normalization

First implementation slice. Presentation only:

- normalize `AccountShell` outer surface/container hierarchy;
- normalize desktop AccountSidebar and navigation groups/items;
- normalize AccountHeader/top-bar/user menu/help/notification chrome;
- normalize mobile account navigation;
- introduce/consume reusable `PageContainer` / `PageHeader` account conventions where they can be established without page-business changes;
- preserve all hrefs, active-route semantics, customer role guard, sign-out behavior, support/WhatsApp destinations, notification destination and mobile navigation destinations.

This establishes the account visual baseline before page-level redesign.

### RD-P06C — Account home normalization

Normalize Account Home information hierarchy, quick actions, upcoming booking, monthly metrics, address/billing/support presentation while preserving dashboard summary, invoice, address, booking and status authority.

### RD-P06D — Customer bookings list normalization

Normalize page header, cards/table switcher, tabs, status presentation, review prompts, paging chrome, side actions and empty/error/loading states. Preserve the current booking-fetch/API contract and all customer modification/review semantics.

### RD-P06E — Booking detail + customer actions

Normalize detail hierarchy, booking summary, timeline, cleaner, pricing, support and action grouping/dialog presentation. Preserve cancel/reschedule/rebook/review eligibility and all stored price/payment/booking authority.

### RD-P06F — Profile normalization

Normalize profile summary, field grouping, FormField treatment, contact preferences and security presentation. Preserve all existing Supabase Auth/profile write contracts and validation.

### RD-P06G — Invoices + payment history

Normalize monthly/per-visit invoice presentation, invoice/payment status semantics, totals, overdue state, payment-history hierarchy, help/trust presentation and responsive layout. Preserve all money/payment authority.

### RD-P06H — Support surfaces

Normalize Help/FAQ/search/contact and formal case presentation, including status/timing/action hierarchy, while preserving support APIs, case data and support destinations.

### RD-P06I — Customer account closure audit

Desktop/mobile/accessibility/non-mutating regression across the governed account surfaces, with preserve-only navigation checks for adjacent account routes.

## Validation strategy

Each RD-P06 implementation slice must require, as applicable:

- exact-head checkout/validation evidence;
- `npm --prefix apps/web run typecheck`;
- targeted customer-account unit/regression tests for touched presentation/domain helpers;
- non-mutating desktop/mobile browser smoke for the touched account surfaces;
- keyboard/focus/label/error-semantic checks for touched controls;
- existing booking/payment regression gates where booking or billing surfaces are touched;
- no real cancel/reschedule/profile write/payment/support-case mutation during presentation smoke unless a separately authorized functional test fixture safely intercepts the request;
- no production deployment, production data mutation or Supabase schema/data mutation.

## RD-P06A decision

RD-P06A is **COMPLETE — READY FOR IMPLEMENTATION SLICES**.

Validation base remains pinned at:

`validation/rd-p06a-base` → `08b149495c00e7a5044bc88511fb2785379dcce2`

Recommended first implementation slice: **RD-P06B — Account shell + navigation normalization**.
