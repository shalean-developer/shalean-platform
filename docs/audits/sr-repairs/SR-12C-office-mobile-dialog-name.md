# SR-12C — Office mobile dialog accessible name

Status: Implemented / CI pending

## Scope

Smallest verified SR-12 accessibility defect after SR-12A and SR-12B.

Target: canonical Office shell mobile navigation drawer in `apps/web/src/features/office/OfficeShell.tsx`.

## Verified defect

The mobile drawer already used `role="dialog"` and `aria-modal="true"`, but it had no accessible name. Assistive technology could therefore encounter an unnamed modal dialog.

## Repair

Add `aria-label="Office navigation"` to the existing mobile drawer dialog container.

## Preserved behavior

- `mobileOpen` state and route-change close behavior
- backdrop close button and its `aria-label="Close menu"`
- `OfficeSidebarContent`
- desktop sidebar
- auth/session/role-gate logic
- first-paint loading state from SR-12A
- denied-gate focus treatment from SR-12B
- command palette, logout and realtime behavior

## Exclusions

No focus-trap redesign, Escape-key redesign, navigation restructuring, visual redesign, production deployment, data mutation, migration, permission, payment, booking-state or notification change.
