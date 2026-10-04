# RD-P07B — Office shell + navigation normalization

Status: **IMPLEMENTED — VALIDATION PENDING**
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p07b-base` @ `1454f728a97e51a6680d9b8fc4480a8e9a6abe26`
Authority: `docs/audits/redesign/rd-p07a-office-design-system-authority-audit.md`

## Scope

Presentation/accessibility normalization of the canonical Office shell and navigation only.

Runtime files:

- `apps/web/src/features/office/OfficeShell.tsx`
- `apps/web/src/features/office/OfficeNav.tsx`

No Office page-domain implementation, API, Supabase migration, RBAC policy, booking/payment/payout/workforce/customer/marketing behavior, pricing logic, or production deployment is authorized.

## Preserved authority

The following behavior remains unchanged:

- `useRoleRouteGuard({ requiredRole: "admin", allowLocalhostDevBypass: true })`;
- Office session lookup and user label;
- unauthenticated/missing-profile/wrong-role handling;
- timeout retry behavior;
- `OFFICE_NAV_MODULES`, `OFFICE_NAV_SECTIONS`, `OFFICE_NAV_ALL_ITEMS` values and hrefs;
- active-route matching;
- `office-sidebar-collapsed` localStorage key and collapse persistence;
- mobile drawer open/close routing behavior;
- global Cmd/Ctrl+K command-palette shortcut;
- command-palette filtering and `router.push(item.href)` navigation;
- notification unread-count calculation and `/office/notifications` destination;
- booking realtime subscription and `office:booking-change` event fan-out;
- sign-out and post-sign-out navigation;
- `OfficePermissionNavigationGate`, `OfficePermissionBoundary`, `OfficeSupervisorTeamsGate` and `OfficeBookingFinancialVisibilityGate` authority.

No navigation module, child item, label, permission rule or destination was added, removed or reordered by RD-P07B.

## Presentation changes

### Office shell

- replaces route-local slate shell/skeleton surfaces with canonical `background`, `card`, `muted`, `border` and warning/primary semantic tokens;
- normalizes skeleton cards and sidebar boundary;
- normalizes denied-state controls with consistent focus-visible treatment;
- adds a descriptive label to the mobile navigation dialog;
- constrains the mobile drawer to `min(88vw, 20rem)` with canonical sidebar surface/border/shadow;
- normalizes the main Office content background to the shared muted surface;
- preserves the existing 220px expanded and 72px collapsed desktop widths.

### Office navigation

- removes literal collapsed-flyout colors in favor of shared/sidebar semantic tokens;
- normalizes flyout radius, border, card surface and elevation;
- adds `aria-current="page"` to active navigation destinations;
- adds consistent keyboard focus-visible rings to sidebar links/buttons, top-bar controls and command-palette results;
- normalizes expanded/collapsed nav spacing and radius treatment;
- preserves the established sidebar token system for active/hover/foreground states;
- normalizes sidebar user/avatar/collapse/logout chrome;
- replaces literal destructive red and top-bar blue/avatar colors with semantic destructive/primary tokens;
- normalizes top-bar background, search control, notification badge and command-palette overlay/surface;
- preserves command-palette and notification behavior.

## RBAC / finance safety

RD-P07B does not touch:

- `OfficePermissionBoundary`;
- `OfficePermissionNavigationGate`;
- `OfficeSupervisorTeamsGate`;
- `OfficeBookingFinancialVisibilityGate`;
- `lib/admin/officeExperience`;
- Office role-assignment helpers;
- `/api/admin/security/my-permissions`.

Therefore RD-P07B does not alter which modules/actions are visible to Owner/Admin/Supervisor/department roles, nor customer-revenue visibility.

## Validation gates

Required before closure:

1. Exact-head `web-test` — success.
2. Exact-head `migration-governance` — success.
3. Desktop `/office` shell smoke:
   - top bar contained;
   - logo/search/notifications/profile contained;
   - expanded sidebar contained;
   - active module state clear;
   - one module expands correctly;
   - sidebar collapse/expand remains functional.
4. Desktop collapsed-sidebar smoke:
   - collapsed width remains usable;
   - one module flyout opens and is fully opaque/contained;
   - flyout destination navigation works.
5. Mobile Office shell smoke:
   - top bar contained;
   - menu opens the drawer;
   - drawer fits viewport and closes;
   - module expansion/nav remain usable;
   - no page-level horizontal overflow.
6. Command palette:
   - Cmd/Ctrl+K or Search opens it;
   - query filters results;
   - Escape closes it;
   - no real mutation occurs.
7. Keyboard/accessibility:
   - visible focus on touched nav/top-bar/palette controls;
   - active destination exposes `aria-current`;
   - mobile drawer remains modal-labelled.
8. Permission safety smoke using the available local Office role:
   - only already-authorized navigation remains visible;
   - no hidden finance/customer-revenue action becomes visible.

No booking creation/update/delete, assignment, payment, payout, notification send, marketing publish, cleaner mutation, customer mutation, or production data change is required or authorized for validation.

## RD-P07B verdict

**IMPLEMENTED — VALIDATION PENDING.**

After exact-head CI and the non-mutating desktop/mobile shell/navigation smoke pass, close the validation PR unmerged and pin RD-P07C from the exact closure head.
