# Email styling production release

Owner authorization: 2026-11-08, “Go ahead deploy it to production.”

Production baseline: `f0099fe51a96ed0eddb4b7447459baec365b6332`, verified live and healthy with production Supabase and live Paystack. Styling is selectively ported from staging PR #1121 onto this baseline. The same shared workspace, navy/blue tokens and email shell cover existing campaign drafts, campaigns, templates/editor, lifecycle, delivery, timeline, recovery, health and analytics. Production delivery retains its original data queries and uses the common branded header.

Production does not yet contain the staging consent/preferences/unsubscribe implementation or restricted test panels. Those components, API routes, migrations, settings and send-gate changes are excluded from this styling release. This release does not claim the full staging email functionality is live in production. All existing production sender logic, recipients, authorization and database behavior are preserved. Stored drafts are not rewritten; no campaign or test sends are requested.

Validation gate: final-head web CI (critical suite, booking-core lint, typecheck, Webpack build/crawl) must pass. Staging PR #1121 must pass CI and deployed desktop/mobile visual checks first. Verify the production artifact SHA and health, keep a recoverable runtime backup and preserve all existing backups, secrets and messaging flags. Confirm existing email screens and mobile navigation after activation. Do not execute provider sends, consent writes or retry actions during UI verification. Roll back to the previous runtime on failed health or material rendering regression.

Status: prepared; publication and deployment evidence to be recorded after verification. No migrations or production feature enablement are included.
