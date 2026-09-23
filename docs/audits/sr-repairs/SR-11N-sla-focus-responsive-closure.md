# SR-11N — SLA Breaches responsive/focus closure repair

## Scope

Final bounded SR-11 repair identified by the SR-11M closure audit.

Target: `apps/web/app/(ui-redesign)/office/sla-breaches/page.tsx`

## Findings addressed

The page still had two closure-level UI consistency gaps:

1. local interactive controls did not all expose the shared Office-style visible keyboard focus treatment;
2. the KPI summary used an unconditional three-column grid, which could compress on narrow screens.

## Changes

- Changed KPI layout from `grid grid-cols-3 gap-3` to `grid gap-3 sm:grid-cols-3`, giving narrow screens a single-column stack while preserving the existing three-column layout from `sm` upward.
- Added `focus-visible` outline/ring treatment to:
  - `Assign all unassigned`;
  - error `Retry`;
  - the SLA search input;
  - severity filter buttons;
  - per-row `Assign now`.
- Preserved existing hover, colour, spacing and action semantics.

## Behavior preserved

No changes were made to:

- `/api/admin/bookings` request path or `filter: "sla"` parameter;
- overdue-minute calculations;
- severity thresholds or filtering;
- search behavior;
- refetch behavior;
- assignment destinations;
- counts or KPI values;
- SLA status data;
- permissions;
- booking/payment/notification state;
- production data or deployment.

## Regression evidence

`apps/web/components/admin/office/__tests__/sr11nSlaFocusResponsiveClosureContract.test.ts` locks:

- the SLA data/refetch/filter/navigation contract;
- the narrow-screen-safe KPI grid;
- visible focus treatment on all five audited local control patterns.

## Closure implication

After this slice is green and merged, SR-11 should receive one short closure verification against the SR-11M findings. If no remaining SR-11 blocker is found, SR-11 can be marked Completed and the programme may proceed to SR-12.
