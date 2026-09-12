# RD-P07A — Office design-system authority + implementation audit

Status: **COMPLETE — READY FOR IMPLEMENTATION SLICES**
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p07a-base` @ `03f722748327a3e5d27acb98ee81032ada68ef1a`
Scope: Office presentation-system audit and implementation authority only. No production deployment, Supabase mutation, admin data mutation, booking/payment/payout/finance/workforce/customer behavior change, auth/RBAC change, notification send, or pricing authority change.

## Programme authority

RD-P06 Customer Account is closed at `03f722748327a3e5d27acb98ee81032ada68ef1a`.

The next approved redesign stage is **RD-P07 — Office design system**.

RD-P07 is a reusable Office presentation-system stage, not a rewrite of Office business logic. It governs the shared admin shell/chrome and reusable presentation patterns that Office pages compose:

- canonical Office sidebar/navigation;
- Office top bar/header and command-palette chrome;
- page-title/subtitle/action hierarchy;
- filter/search/date controls and tab/segment presentation;
- table/list shells;
- cards/metrics/status presentation;
- action menus, dialogs and dropdown presentation;
- responsive/mobile Office shell behavior;
- representative adoption of the shared system without changing domain behavior.

The global reusable UI system remains presentation authority. Repaired platform business logic, RBAC and domain services remain authoritative.

## Existing canonical Office frame

`apps/web/app/(ui-redesign)/office/layout.tsx` is the route-group layout. It currently composes:

1. `AppMonoFontScope`;
2. non-production environment indicator;
3. `OfficeBookingFinancialVisibilityGate`;
4. `OfficePermissionNavigationGate`;
5. `OfficeShell`;
6. `OfficePermissionBoundary`;
7. `OfficeSupervisorTeamsGate`.

RD-P07 must normalize this existing frame and must not introduce a parallel Office layout or bypass any gate.

### `OfficeShell`

`apps/web/src/features/office/OfficeShell.tsx` is the canonical Office application shell. It owns:

- `useRoleRouteGuard({ requiredRole: "admin", allowLocalhostDevBypass: true })`;
- Office checking/timeout/denied states;
- authenticated session label;
- desktop sidebar container and collapsed-state persistence;
- mobile navigation drawer;
- top bar;
- global Cmd/Ctrl+K command palette shortcut;
- booking realtime subscription and `office:booking-change` event fan-out;
- sign-out and post-sign-out navigation;
- canonical Office `<main>` container;
- `AdminToastHost`.

RD-P07 may redesign presentation and accessibility of these surfaces but must not change the guard, subscription, sign-out, routing, storage key or session semantics.

### `OfficeNav`

`apps/web/src/features/office/OfficeNav.tsx` is the canonical navigation source. `OFFICE_NAV_MODULES`, `OFFICE_NAV_SECTIONS` and `OFFICE_NAV_ALL_ITEMS` feed the sidebar and command palette.

Current modules include Dashboard, Bookings, Finance, Analytics, Operations, Growth, Workforce and Customers.

RD-P07 must preserve:

- every existing href;
- active-route matching;
- module grouping unless a separately approved information-architecture change is opened;
- collapsed sidebar persistence;
- mobile drawer destinations;
- command-palette destinations;
- logout behavior.

## RBAC / visibility authority — preserve only

### `OfficePermissionBoundary`

`OfficePermissionBoundary` evaluates `policyForOfficePath`, assigned Office roles and permission requirements from `/api/admin/security/my-permissions`. It also keeps supervisor-only pending-scope routes denied until their data supports team scoping.

RD-P07 must not change route policy, role audience, permission requirements, supervisor exclusions or permission error behavior as part of presentation normalization.

### `OfficePermissionNavigationGate`

`OfficePermissionNavigationGate` is authoritative for permission-filtered Office navigation and selected page-action visibility. It:

- filters Office nav modules/sections/items by role + permission policy;
- restores the Earnings Policies Finance item in its current compatibility logic;
- hides supervisor routes that are not yet team-scoped;
- controls booking Create/Export action visibility;
- provides role-specific `/office` dashboard composition;
- includes `OfficeRoleDashboard`, `OfficeMyWorkPanel` and `SupervisorModeSwitcher`.

RD-P07 may normalize the visual container around these outputs but must not weaken or bypass their permission decisions.

### `OfficeSupervisorTeamsGate`

`OfficeSupervisorTeamsGate` owns the supervisor-specific `/office/teams` read model and ensures customer payment/company revenue are not exposed to supervisors. RD-P07 must preserve its API, data scope, earnings restriction and supervisor-view behavior.

### `OfficeBookingFinancialVisibilityGate`

`OfficeBookingFinancialVisibilityGate` hides customer-revenue/payment presentation and actions on booking-detail surfaces unless `finance.customer_revenue.view` is granted.

RD-P07 must preserve this authority. A redesign must not make a hidden customer amount, Payments tab, pricing drill-down, Mark as Paid or related revenue action visible to unauthorized roles.

## Existing reusable Office presentation layer

`apps/web/components/admin/office/OfficeZohoChrome.tsx` is the strongest current reusable Office chrome collection. It currently provides:

- `OfficeZohoPageHeader`;
- primary/secondary action buttons;
- metric cards and metric rows;
- segment tabs;
- pill tabs;
- toggle presentation;
- `OfficeZohoTableShell`.

This component set should be treated as an adoption/migration source, not automatically as final design authority. RD-P07 should converge it with global shared primitives/tokens where practical rather than create a second `Office*` design system beside it.

Particular care is required around `OfficeZohoTableShell`: it includes permission-aware customer-revenue column hiding. Any replacement or refactor must preserve that visibility contract exactly.

## Principal Office design-system debt

The audit identifies these presentation-system problems:

1. `OfficeShell` still mixes global semantic tokens with route-local slate/amber/emerald styling.
2. `OfficeNav` contains a substantial amount of hard-coded visual styling, including literal colors in collapsed flyouts and active states.
3. `OfficeZohoChrome` duplicates button/card/tab patterns that partially overlap the global reusable primitives.
4. Office pages use several competing page-header/title/action structures.
5. Filters, search bars, date controls and tabs vary substantially between routes.
6. Table shells, loading/empty/error states and row action affordances are inconsistent.
7. Metric/stat cards use multiple radii, typography scales and status/color conventions.
8. Dialogs, confirmation panels, dropdowns and action menus have inconsistent presentation despite high-risk underlying actions.
9. Some permission and finance-visibility enforcement currently relies on DOM visibility compatibility logic; RD-P07 must not accidentally break these selectors/labels while normalizing presentation.
10. The `/office` dashboard is composed by permission/role logic in `OfficePermissionNavigationGate`, so it cannot be treated as an ordinary static page.

## RD-P07 boundaries

### In scope

- presentation-only Office shell/navigation normalization;
- reusable Office page-header/action primitives;
- shared filters/tabs/search/date-control presentation;
- table/list shell presentation;
- card/metric/status presentation;
- reusable dialog/dropdown/action-menu presentation;
- loading/empty/error state consistency;
- accessibility, keyboard, focus and responsive behavior;
- representative Office page adoption needed to prove the shared system.

### Out of scope unless separately authorized

- admin role or permission changes;
- navigation destination changes;
- supervisor/team-scope rules;
- customer-revenue visibility rules;
- booking creation/update/delete/assignment behavior;
- payment, invoice, refund, reconciliation or payout logic;
- cleaner/workforce state or earnings rules;
- customer/CRM ownership logic;
- marketing send/publish behavior;
- analytics calculations;
- API/query/schema changes;
- production deployment or data mutation.

## Approved implementation order

### RD-P07B — Office shell + navigation normalization

Normalize `OfficeShell` and `OfficeNav` presentation first:

- shell background/container rhythm;
- desktop sidebar width/collapsed presentation;
- module/child nav item hierarchy;
- active/hover/focus states;
- top-bar visual hierarchy;
- mobile drawer presentation;
- command-palette chrome where presentation is shared with the shell;
- loading/denied/timeout presentation where safe.

Preserve all route guard, permission filtering, hrefs, active-route logic, sign-out, command shortcut, realtime subscription and mobile behavior.

### RD-P07C — Office page header + action hierarchy

Establish one canonical reusable Office page-header pattern for title, subtitle, live/status indicator and primary/secondary action grouping. Converge `OfficeZohoPageHeader`/button presentation with the global shared primitives while preserving action handlers and permission visibility.

### RD-P07D — Filters, tabs, search + date controls

Normalize reusable filter bars, pill/segment tabs, search controls, date/date-range controls and toggles. Preserve query semantics, selected values, API parameters, counts and existing permission rules.

### RD-P07E — Tables + list shells

Normalize table/list containers, headers, row density, responsive overflow, loading/empty/error presentation and pagination/action placement. Preserve sorting, pagination/query authority, row actions and especially `finance.customer_revenue.view` visibility behavior.

### RD-P07F — Cards, metrics + status presentation

Normalize Office metric/stat cards, summary cards, status badges and operational alert presentation through semantic tokens. Preserve all calculated values, domain statuses, money visibility and role scope.

### RD-P07G — Dialogs, dropdowns + action menus

Normalize confirmation dialogs, destructive actions, assignment/edit panels, dropdowns and row action menus. Presentation/accessibility only. No mutation contract, permission check, validation, side effect or API call may change.

### RD-P07H — Representative adoption + design-system regression

Adopt the resulting shared system on a small representative cross-section of Office surfaces sufficient to prove:

- dashboard/summary composition;
- bookings/operations table-heavy composition;
- schedule/filter-heavy composition;
- workforce/cleaner composition;
- finance presentation with restricted customer-revenue visibility;
- desktop/mobile shell behavior.

This is not authorization to redesign every Office route in one slice. Domain-specific page redesign remains separately scoped.

### RD-P07I — Office design-system closure audit

Run desktop/mobile/accessibility/RBAC non-mutating regression across the canonical Office shell and representative adopted surfaces. Verify preserve-only navigation/action destinations and permission/finance/supervisor visibility contracts before RD-P07 may close.

## Validation strategy

Each RD-P07 implementation slice must require, as applicable:

- exact-head validation against a pinned previous-slice base;
- `web-test` and `migration-governance` on the exact head;
- targeted unit/regression tests for any touched shared Office components;
- non-mutating desktop/mobile browser smoke;
- keyboard/focus/labels/ARIA checks for nav, tabs, menus, dialogs and controls;
- owner/admin + restricted-role visibility checks where the touched component participates in RBAC;
- supervisor-specific smoke when touching team/workforce shell presentation;
- finance visibility smoke when touching table/detail/payment presentation;
- no real booking mutation, finance action, payout action, customer contact, notification send, marketing publish or support mutation during presentation validation;
- no production deployment or Supabase mutation.

Validation PRs remain validation-only and must be closed unmerged after successful evidence, following the existing redesign programme pattern.

## RD-P07A decision

RD-P07A is **COMPLETE — READY FOR IMPLEMENTATION SLICES**.

Validation base is pinned at:

`validation/rd-p07a-base` → `03f722748327a3e5d27acb98ee81032ada68ef1a`

Recommended first implementation slice:

**RD-P07B — Office shell + navigation normalization**.
