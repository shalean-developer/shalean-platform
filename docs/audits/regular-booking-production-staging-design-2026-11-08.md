# Regular Cleaning: production/staging journey and design audit

Owner direction: keep the new Home → Schedule → Your Details → Payment flow aligned with production's booking controls and the public homepage design. Scope is Regular Cleaning only.

## Comparison and evidence

| Area | Production | Staging / new flow | Resolution |
| --- | --- | --- | --- |
| Entry URL | `step=details&section=address` opens the address-first progressive Details journey | Old section links normalize into Home; full address is deferred | Preserve compatibility and the new four-stage contract |
| Header | Details / Schedule / Review / Payment; public logo on desktop | Home / Schedule / Your Details / Payment; mobile lacked the logo | Keep new stage labels, restore a visible mobile brand row |
| Home | Existing property cards and progressive questions | Reused property cards, custom room/pet/suburb selects, explicit equipment choice | Preserve controls and answer values; align sections and headings to shared public-site tokens |
| Schedule | Production component's progressive stages | Same component in one combined screen | Keep one screen; stack actions on mobile and explain blocked Continue |
| Details/review | Saved/custom address, contact, access information and review | Reuses PropertyAddressSection, equipment quote and Step3Review | Keep these production controls and server validation; align the surrounding heading/card |
| Payment | Existing Step4Payment and server confirmation | Same payment component and financial guards | No new payment engine or financial rule changes |
| Desktop layout | Offset form and fixed-width floating summary | Inherited offset, large gaps and fixed summary | New-flow-only grid with an in-column sticky summary |
| Brand | Homepage uses Geist, primary blue, navy, shared spacing and radii | New wrappers contain independent hard-coded treatments | Reuse HomeSectionHeader, canonical tokens and public CTA radius |

Live browser inspection covered the production address/property screens, staging Home/Schedule and homepage. Production's Back from its first address section returns to the service hub; this is expected legacy navigation, not proof that the new staging flow is broken. Later-stage inspection uses the shared source and isolated full-journey tests; no live production checkout was submitted. Never describe source inspection as completed live payment acceptance.

Different displayed prices/hours are not a controlled pricing comparison: the two environments have independent catalogs, draft answers and equipment state. Do not copy staging rates into production or infer a financial defect from those totals.

## Fix boundaries

All layout changes are scoped to the enabled Regular simplified journey. Production's environment hard-denial remains in place. Other services and legacy layouts retain their existing behavior. No migration, database write, provider setting, promotion eligibility, price formula, booking creation or charge is part of this patch.

The new Schedule readiness message describes the existing readiness gate; it does not relax availability verification. Equipment delivery must still be resolved for the full address. Pending-payment recovery remains server-owned.

## Verification and release

Local TypeScript validation and 42 focused booking/equipment/payment tests passed. Targeted lint has no errors (existing Step2Schedule warnings remain). Local browser installation failed because the Chromium download was truncated, so exact-head GitHub browser CI is required before merge.

Expanded isolated tests cover Home, Schedule, Details and Payment at 320, 375, 768, 1024 and 1440px, plus recurring desktop. They verify no horizontal overflow, mobile logo, summary/form separation, stacked mobile actions, accessible blocked reasons, old-link normalization and no unmocked mutations.

Use the existing main → prebuilt deploy/staging → Plesk path only after required exact-head checks pass. Preserve all rollbacks and private runtime loader. Production promotion is a separate acceptance gate: this patch does not enable the new journey on production.

Decision: CONDITIONAL PASS — source prepared; exact-head browser/build checks and hosted staging verification required before release acceptance.
