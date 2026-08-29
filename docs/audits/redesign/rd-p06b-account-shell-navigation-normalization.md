# RD-P06B — Account shell + navigation normalization

Status: IMPLEMENTED — CI PASSED / LOCAL VISUAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06b-base` @ `e3a44de427c9d3bab0207d01ecffe593e0db520e`
Validated implementation head: `ff665976c2320e23a9787b9a0567d0a77356595b`
Validation PR: #460 — draft, validation only, close unmerged after local visual approval.
Scope: presentation-only normalization of the canonical customer account shell/navigation. No production deployment, Supabase mutation, auth/RBAC behavior change, booking/payment mutation, customer ownership change, invoice/payment-state change, or support-case mutation.

## Governing authority

RD-P06A defines the Customer Account redesign authority and makes RD-P06B the first implementation slice.

The Shalean Global Reusable UI System requires reuse-first composition, semantic global tokens, shared account-shell/navigation patterns, shared control primitives, and accessibility as an acceptance criterion. Repaired platform business logic remains authoritative.

## Runtime files changed

Only the canonical account chrome is changed by the implementation:

- `apps/web/src/features/account/AccountShell.tsx`
- `apps/web/src/features/account/AccountNav.tsx`

No account page body, customer API, Supabase query/mutation, booking hook, invoice/payment helper, profile write path, support-case API, or Booking V2 file is changed.

## Presentation changes

### AccountShell

- retained `useRoleRouteGuard({ requiredRole: "customer" })` exactly as the access authority;
- removed the second standalone support-cases strip and consolidated that entry point into the account header;
- normalized the root surface to semantic `background`, `foreground`, `muted`, `card` and `border` roles;
- kept the canonical fixed desktop sidebar + responsive mobile bottom navigation model;
- normalized the page content container to the global wide-container/page-gutter tokens;
- normalized checking skeleton surfaces without changing guard state behavior.

### Account navigation

- introduced a reusable internal `AccountNavLink` renderer so desktop nav items share one active/hover/focus treatment;
- retained every existing NAV and MOBILE_NAV href and grouping;
- added `aria-current="page"` to active desktop/mobile/profile navigation entries;
- normalized sidebar/header/mobile chrome to semantic global tokens rather than route-local gray/blue hard-coding;
- retained the existing Shalean logo home destination;
- retained the existing profile destination and user identity data;
- retained logout behavior and moved destructive styling to the canonical destructive Button/token treatment;
- established `AccountHeader` as the canonical header export while preserving `AccountTopBar` as a compatibility alias;
- retained WhatsApp support, notifications, support cases, profile settings, back-to-website and sign-out destinations/actions;
- retained the mobile Home / Bookings / Billing / Book / Profile destinations and Book emphasis.

## Authority preserved

RD-P06B does not change:

- customer role/access verification or redirects;
- Supabase Auth/session logic;
- customer profile/user metadata;
- booking visibility, cancellation, rescheduling or rebooking;
- invoice/payment/refund state;
- Paystack behavior;
- support-case APIs/data;
- any page-specific account business logic;
- any production configuration/data.

## Diff-scope proof

Comparison from `e3a44de427c9d3bab0207d01ecffe593e0db520e` to implementation head `ff665976c2320e23a9787b9a0567d0a77356595b` contains exactly three files:

1. `apps/web/src/features/account/AccountNav.tsx`
2. `apps/web/src/features/account/AccountShell.tsx`
3. `docs/audits/redesign/rd-p06b-account-shell-navigation-normalization.md`

No page-body, customer API, booking/payment, Supabase or profile/support mutation file is in the implementation diff.

## Exact-head CI evidence

### migration-governance

Workflow run: `33251968350`
Conclusion: **success**.

### web-test

Workflow run: `33251968372`
Job: `99099078148`
Conclusion: **success**.

The exact implementation head passed:

- PR-head SHA equality check;
- dependency audit;
- critical payment/referral tests;
- privileged Office email security contract;
- revenue-path tests;
- marketing/Meta compliance tests;
- blog governance;
- TypeScript typecheck;
- Booking core ESLint;
- SEO/canonical/Search Console readiness gates;
- production Next.js build;
- local production server start;
- internal-link crawl;
- location/compliance route matrix.

Vercel status on the same implementation head was also successful. This is preview/status evidence only; no production deployment was performed by RD-P06B.

## Remaining validation gate

RD-P06B remains open until:

1. the audit-only final head reruns the exact-head repository guards successfully;
2. desktop local account shell visual confirms sidebar/header/content alignment, active states and no duplicate support strip;
3. mobile local visual confirms bottom navigation, safe-area spacing and no horizontal overflow;
4. navigation destinations and sign-out behavior remain unchanged by source/diff review;
5. no production deployment or production data mutation is performed;
6. validation PR #460 is closed without merge after approval.

## Local visual checklist

Inspect at minimum:

- `/account`
- `/account/bookings`

Desktop:

- one sidebar only;
- one top account header only;
- Shalean logo sized correctly;
- active nav state clearly visible;
- content begins cleanly below header and beside sidebar;
- Support cases appears in the header rather than a second horizontal strip;
- notification/avatar controls align and remain usable.

Mobile:

- no desktop sidebar;
- compact header remains readable;
- bottom Home / Bookings / Billing / Book / Profile navigation is usable;
- Book remains visually primary;
- active route has visible state and `aria-current` semantics;
- no horizontal overflow.

## Current decision

RD-P06B is **implemented and CI-passed**, but remains **open pending final audit-only exact-head CI confirmation and local desktop/mobile visual approval**.
