# SR-12D — Office mobile dialog Escape dismissal

## Status
Implemented / CI pending.

## Verified defect
The canonical Office mobile navigation drawer already had modal semantics and an accessible name, but keyboard users could not dismiss it with Escape.

## Repair
- Add a `keydown` listener only while `mobileOpen` is true.
- On `Escape`, prevent the default event and set `mobileOpen` to false.
- Remove the listener when the drawer closes or the effect is cleaned up.

## Preserved contracts
- Existing overlay close button and `OfficeSidebarContent` close path.
- `role="dialog"`, `aria-modal="true"`, and `aria-label="Office navigation"` from SR-12C.
- Office auth/session/role branching.
- SR-12A accessible loading announcement.
- SR-12B denied-gate focus-visible treatment.
- Desktop sidebar, command palette, realtime booking subscription, logout and routing behavior.

## Explicit exclusions
- No focus trap implementation.
- No focus-return redesign.
- No navigation restructuring or visual redesign.
- No production data mutation, migration, permission, payment, booking-state, notification, or deployment changes.
