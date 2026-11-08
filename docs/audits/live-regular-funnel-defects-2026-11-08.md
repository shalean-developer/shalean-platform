# Live Regular Cleaning + Funnel Intelligence corrections

Owner direction: stop developing the simplified journey, retain its code for reference, keep production's address-first progressive journey and design, and fix confirmed booking/reporting defects.

## Confirmed evidence
The live dashboard showed 280 Service sessions in the main funnel but 270 in its step table and 60/270 progression. Current main already corrects this display inconsistency; do not claim it is fixed on production yet or add another estimator.

The tracker had no internal Details/Schedule screen identity, attributed Back to the destination step, and submitted full URLs unnecessarily. The generic Payment drop-off label described the narrower Paystack-open cohort, whereas Checkout to paid uses checkout sessions.

## Corrections
- Pin the existing staging build's preview flag OFF. Keep experiment source and reference tests; a stale repository variable must not reactivate the rejected flow.
- Preserve all live booking screens, controls, order and financial behavior.
- Add enumerated Regular-only screen IDs to views, navigation and page leaves. Keep canonical coarse stages and distinct-session counts.
- Attribute Back/Next to the source screen, including movement within one wizard step.
- Strip href at client emission and server ingestion. Retain recognized public booking pathnames without query/hash values.
- Show distinct screen views and recorded page leaves. A page leave is not proof of permanent abandonment. Do not fabricate historical screen data.
- Label Paystack drop-off precisely. Preserve existing session-correlation, revenue-exclusion and source-reliability corrections.

## Verification and release
Unit tests cover allowed screen IDs, source attribution, duplicate-session aggregation, historical records and URL privacy. An API test verifies internal views do not inflate coarse-stage session totals. The existing non-mutating live Schedule browser test captures analytics and verifies screen views and source-attributed Back.

The editing workspace became unavailable; source was prepared through GitHub. No local validation is claimed. Exact-head GitHub unit, type, lint, build and browser checks are required before integration.

Use the existing main → deploy/staging → Plesk release path, preserving test providers, disabled messaging, private loader and every rollback. Production requires a narrow source port and separate acceptance; never merge unrelated main work into production. No migrations, bookings, charges, historical analytics rewrites, sends or provider-setting changes.

Decision: CONDITIONAL PASS — source candidate; exact-head CI and hosted live-flow verification pending.
