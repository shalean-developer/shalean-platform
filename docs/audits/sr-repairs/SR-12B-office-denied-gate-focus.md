# SR-12B — Office denied-gate keyboard focus visibility

## Status
Implemented / CI pending

## Scope
Accessibility-only repair in `apps/web/src/features/office/OfficeShell.tsx`.

## Verified defect
The Office denied-access state exposed three interactive actions that relied on hover styling without an explicit `focus-visible` treatment:

- `Try again`
- `Use a different account`
- `Login as Admin`

This made keyboard focus less visible than the shared Office interaction standard established during SR-11.

## Repair
Added explicit `focus-visible` outline/ring treatment to all three denied-gate actions.

- neutral retry/account-switch actions use the shared ring token;
- the primary login action uses an emerald focus ring matching the action colour;
- no event handlers, hrefs, redirect targets, role checks, auth/session behavior or denied-gate branching changed.

## Preserved contracts
- `onClick={onRetry}` remains unchanged.
- login redirects still use `/login?redirect=${encodeURIComponent(redirectTarget)}`.
- SR-12A first-paint loading accessibility remains intact (`role="status"`, polite live region, busy state, sr-only loading message).
- no production data, migrations, permissions, payments, booking state, notifications or deployment changes.

## Regression evidence
`apps/web/src/features/office/__tests__/sr12bOfficeDeniedGateFocusContract.test.ts`

The contract verifies all three denied-gate actions retain visible keyboard focus and preserves retry/login behavior plus the SR-12A loading-state contract.

## Next
After CI is green and this slice is merged, continue SR-12 with the next smallest verified loading/landmark/keyboard/focus/assistive-technology issue.
