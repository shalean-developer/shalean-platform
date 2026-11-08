# Customer Profile audit and redesign — 8 November 2026

Scope: `/account/profile` on staging. Owner requested SweepSouth's profile structure with the Shalean homepage visual language. Existing customer header, sidebar, avatar service and marketing consent controls are preserved. No company billing schema or speculative company-details form is added.

## Confirmed defects and corrections

| Finding | Correction |
| --- | --- |
| Duplicate booking totals, unrelated reviews, property and referral cards pushed editing down a long page | Focused My details, Profile photo and existing email preferences sections; relevant destinations remain in navigation |
| Oversized blue identity banner dominated the profile | White bordered panels, navy headings, Shalean blue actions, two-column desktop fields and single-column mobile fields |
| Invalid phone text/trailing digits could be persisted or silently truncated | Validate the entire South African number before any write; normalize accepted input |
| Clearing a phone omitted database/auth fields, leaving stale values | Explicit null for both database phone columns and empty auth fallback |
| Birthday accepted invalid/future dates | Validate a real date between 1900 and today |
| Invalid password rejected only after other profile mutations | Separate password action and confirmation; preserve password whitespace |
| Profile lookup errors silently produced editable fallback fields | Read errors/missing profile block editing and offer retry; no fabricated role/profile insertion |
| Uncaught save failures left the saving state active | try/catch/finally and visible retry feedback |
| Zero-row updates could appear successful | Require the current user's returned updated row |
| Auth refresh could reset unsaved profile inputs | Load by user identity/retry only, hide stale identity data during account changes |
| Fields lacked associated error feedback | Inline errors, aria-invalid/describedby, focus first invalid field, live save/photo/password status |
| Password eye button in the shared component was removed from keyboard order | This page uses a normal keyboard-accessible show/hide action for both password fields |
| No clear distinction between photo save and contact save | Photo changes save automatically with their own status; contact Save indicates dirty/busy state |

## Validation

- Focused validation and rendered interaction tests cover malformed numbers, birthday validation, clearing values, password confirmation and isolation, exact password preservation, profile-load failure and partial metadata-sync failure.
- Existing avatar authorization/image tests remain in the critical suite.
- Pagination convergence test now asserts Profile fetches no booking history/aggregate data.
- Required gates: critical suite, booking-core lint, TypeScript, latest-head CI and staging health/UI verification.
- Live verification must not change the owner's password, marketing consent or photo. Real profile data changes remain for owner acceptance.

## Persistence limitation

Auth metadata and the profile row are separate systems. If the profile write succeeds but metadata syncing fails, the page states that explicitly and leaves Save available for retry; it does not claim complete success. Existing RLS and self-service auth controls remain in effect.

Production deployment is outside this release. Staging acceptance remains with the owner.
