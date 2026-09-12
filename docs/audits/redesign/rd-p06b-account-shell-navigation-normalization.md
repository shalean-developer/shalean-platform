# RD-P06B — Account shell + navigation normalization

Status: PASSED / CLOSED — final audit-only exact-head guard required before validation PR close
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06b-base` @ `e3a44de427c9d3bab0207d01ecffe593e0db520e`
Validated implementation head: `ff665976c2320e23a9787b9a0567d0a77356595b`
Pre-closure audit-only head: `0f3e0d138ca096c9019aa55d119d666f4cba5bc7`
Validation PR: #460 — draft, validation only; close unmerged after the final closure commit reruns exact-head guards.
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

### Implementation-head migration-governance

Workflow run: `33251968350`
Conclusion: **success**.

### Implementation-head web-test

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

### Pre-closure audit-only head

Audit-only head `0f3e0d138ca096c9019aa55d119d666f4cba5bc7` also passed exact-head repository guards before local visual closure:

- migration-governance run `33252267623` — **success**;
- web-test run `33252267624` — **success**.

## Local visual approval

Local desktop visual evidence was supplied for both `/account` and `/account/bookings`.

Desktop approval confirmed:

- one canonical sidebar only;
- one canonical account header only;
- Shalean logo is appropriately sized;
- Home and My Bookings active navigation states are visibly distinct;
- content aligns correctly beneath the header and beside the sidebar;
- Support cases is integrated into the header with no duplicate horizontal support strip;
- WhatsApp, notification and profile controls align coherently;
- no visible horizontal overflow.

Local mobile evidence was then supplied at an even narrower viewport than the requested 390–430 px review range. It still confirmed:

- no desktop sidebar;
- compact account header remains usable;
- bottom navigation contains Home / Bookings / Billing / Book / Profile;
- Book remains visually primary;
- mobile navigation remains contained at the viewport width;
- no visible horizontal page overflow;
- bottom navigation does not obscure the final account content.

The mobile capture showed expected content-copy truncation inside page-body quick-action/trust cards at this unusually narrow width. Those are page-body presentation concerns for RD-P06C/RD-P06D and do not block the RD-P06B shell/navigation slice.

The yellow `Could not verify your access. Retry` banner visible in local evidence is the existing `RoleGuardRetryBanner` rendered when the preserved role guard reports `timeout`; RD-P06B did not introduce or suppress that functional state. Any persistent valid-session timeout is a separate auth/role-guard repair concern, not a presentation-shell closure blocker.

## Closure decision

RD-P06B is **PASSED / CLOSED** based on:

1. controlled shell/navigation-only runtime scope;
2. exact implementation-head CI success;
3. pre-closure audit-only exact-head CI success;
4. desktop visual approval on Account Home and My Bookings;
5. mobile shell/navigation approval at a viewport narrower than the target review width;
6. preserved customer role guard, hrefs, sign-out behavior and account-domain business authority;
7. no production deployment, production data mutation or Supabase mutation.

The only remaining procedural step is for this final audit-only closure commit to rerun the exact-head guards successfully; validation PR #460 must then be closed **without merge**.
