# Local guide FAQ accuracy repair — source preparation

Tracked defect: SEO-CONTENT-04, discovered during the owner's ordered indexing/content evidence refresh. Main baseline: 1e8e5629544983a49b58035e5576cab5e6160f4d.

Live Claremont pricing FAQ inherits Atlantic Seaboard/R450 text; Newlands frequency FAQ inherits Atlantic Seaboard advice. Inland checklist FAQs assume coastal grit. Shared FAQ generator feeds both visible content and FAQPage schema.

Change: correct only 24 pricing, frequency and checklist guide FAQ sets. Explain price drivers/illustrative ranges without a universal price, use household needs for scheduling, and make balcony work conditional on the property. Update modification dates for changed guides only; preserve publication dates. Broader similarity/indexing outcomes remain open.

Regression: 26 focused cases registered in test:critical; 1,647 critical tests passed. Scoped lint and booking lint passed; TypeScript passed. Final CI/deployed checks are recorded in the canonical progress tracker.

Acceptance: final-head CI; all 24 deployed staging pages have corrected visible FAQ and matching structured data, self-canonical, one H1, HTTP 200 and staging noindex. Production remains separately gated. No database/CMS, price configuration, booking, redirect, canonical or indexing-submission changes. Rollback: bounded source revert.

Current evidence and tracker:
https://github.com/shalean-developer/shalean-platform/blob/audit/seo-remediation-20261101/docs/audits/seo/SEO-REMEDIATION-TRACKER-2026-11-01.md

Production candidate baseline: 2db35d354b49bf9f4dddc08b6a406635b453f868. Source PR #1016. Only the bounded FAQ source, regression and test registration are transferred; unrelated main changes excluded.
