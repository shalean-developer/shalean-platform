# Shalean SEO remediation tracker — 1 November 2026

## Authority and workflow

Owner instruction: “Lets start fixing as per your order. track them as we fix so that we know what we are fixing.” This admits bounded fixes to verified existing behavior, not a new redesign programme. Existing release-control rules and historical SEO evidence remain in force. No financial, booking-state, CMS-record, authentication, redirect or indexing submission changes are included in the first slice.

Lifecycle: Audit → defect → source of truth → fix → regression → staging → verify → merge → production → reconcile → close. A source fix is never marked Closed. Status values: Queued, Investigating, Source prepared, Local verified, CI verified, Staging verified, Production verified, Closed, Not a defect, Needs refreshed evidence.

Source baseline: main `c1585c0ffcefbe698371c1f309a3ceaf4ab508ae`. Fresh branch `fix/seo-metadata-20261101`. This file is the canonical tracker for this bounded remediation; it does not replace earlier audit or programme trackers.

## Ordered register

| ID | Order | Finding / scope | Status | Closure evidence required |
| --- | --- | --- | --- | --- |
| SEO-META-01 | 1 | Repeated description padding: Newlands/Observatory standard cleaning and Constantia carpet cleaning live examples; shared `metaDescription.ts` | CI verified | HTML/OG/schema descriptions have no repeated generated padding; concise authored copy retained; staging and production verified |
| SEO-META-02 | 1 | Blog titles/descriptions cut to literal ellipses; shared description clamp and blog title formatter | CI verified | Complete authored wording in HTML, OG/Twitter and schema; no newly generated ellipses; verify CMS and static examples |
| SEO-META-03 | 1 | Blog formatter appends Cape Town/brand/year to already qualified headlines | CI verified | Location/brand not appended twice; existing dates retained; no automatic current-year freshness claim |
| SEO-META-04 | 1 | Location/service title formatter still uses `clipSerpTitle`; inventory actual affected outputs | Queued | Review complete copy and repair independently without changing ranking intent |
| SEO-META-05 | 1 | Booking and cleaner-login canonical inherits homepage | Queued | Appropriate route canonical with intentional noindex preserved; invalid-route redirect intact |
| SEO-META-06 | 1 | Booking social metadata inherits homepage | Queued | Page-specific title/description/URL; no funnel behavior change |
| SEO-META-07 | 1 | Missing initial HTML H1 on booking routes; cleaner-login warning requires rendered check | Queued | Meaningful rendered heading and accessible page name; no duplicate H1 introduced |
| SEO-COPY-01 | 1 | Customer-visible technical wording in navigation/location directory | Queued | Plain customer wording; navigation destinations unchanged |
| SEO-INDEX-01 | 2 | Stored index inspection: 19 crawled not indexed, 3 discovered not indexed, 22 unknown, 4 historical 404 | Needs refreshed evidence | Fresh priority URL inspection, live status reconciliation and individually justified remediation; indexing is not guaranteed |
| SEO-CONTENT-01 | 2 | 173 pages flagged similar by crawler | Investigating | Compare main content and evidence; retain/differentiate/consolidate per URL; no bulk deletion or redirect based solely on score |
| SEO-CONTENT-02 | 2 | Overlapping deep-versus-regular articles | Queued | Query/content comparison and approved URL disposition; no proven cannibalisation yet |
| SEO-CONTENT-03 | 2 | Weak commercial service-page search visibility | Queued | Intent mapping, verified service details/proof and a dated search/lead baseline |
| SEO-LINK-01 | 3 | Seven reported orphan articles | Queued | Confirm crawl reachability; relevant contextual links to retained pages; no redirects introduced |
| SEO-PERF-01 | 4 | 37 sub-90 scores among 48 measured URLs | Queued | Representative mobile/desktop lab diagnosis plus real-user LCP/INP/CLS evidence; avoid treating score alone as CWV failure |
| SEO-LOCAL-01 | 5 | Local Business hours/entity facts, GBP and citations not fully verified | Queued | Verified business facts, schema parity and GBP/citation review |
| SEO-AUTHORITY-01 | 5 | September snapshot: 224 broken backlinks / 3 destinations | Needs refreshed evidence | Fresh source/destination checks before any recovery redirects |
| SEO-MEASURE-01 | 5 | GA sessions −85.7% while GSC clicks −0.5% | Queued | Tracking/channel/deployment/consent reconciliation; not assumed SEO collapse |
| SEO-MEASURE-02 | 5 | Organic enquiry → booking → payment attribution unverified | Queued | Reconcile events and actual funnel evidence without creating financial entries |
| SEO-SCHEMA-01 | 5 | Schema presence checked, full correctness/eligibility pending | Queued | Representative validation and visible-content parity; no unsupported review/FAQ benefit claims |
| SEO-MOBILE-01 | 4 | Actual phone accessibility/rendering audit outstanding | Queued | Real rendered mobile behavior, navigation, focus, headings and overflow evidence |

## Qualified or rejected automated warnings

- Ten non-indexable utility/booking routes: not automatically defects. Preserve intended exclusions.
- Nine missing-schema pages are booking/cleaner forms: low priority, not a reason to add unnecessary schema.
- `/locations` OpenGraph missing warning: contradicted by live tags on audit date; no fix claimed.
- Homepage slash canonical warning: not proven material; normal URL serialization must be checked before change.
- Constantia carpet article currently returns 200 despite stored Google 404; refresh before repair.
- No internal broken links, current error pages, sitemap errors or missing alt attributes reported by crawl. Presence checks do not certify copy quality or accessibility.

## Slice 1 — shared descriptions and blog titles

Implementation: stop minimum-length padding and hard-cut description truncation; collapse consecutive copies of the known legacy padding only; preserve full authored descriptions and deterministic generators. Blog title formatter retains the complete headline, adds geo/brand only when absent and within a soft display budget, and adds a year only when explicitly requested. Preserve routing, canonical ownership, indexability and publication state.

Tests: regression fixtures reproduce the repeated-padding and long-title cases, normalization idempotence, authored year/brand/geo retention and complete long descriptions. Existing tests that required repetitive padding or literal truncation were corrected to assert the intended behavior.

Validation:

- Focused metadata regressions: 25 passed.
- Complete SEO/blog suite: 481 passed, 4 failed across 3 files. The same four failures reproduced on unchanged baseline source: core sitemap count mismatch (12 vs 11), two historic shalean.com redirect-map assertions, and Standard/Regular supplies-policy copy assertion. No tests or guards suppressed.
- Critical suite: 1,592 passed across 140 files after registering both metadata test files in `test:critical`. No existing test was removed.
- Enforced booking lint: passed, four pre-existing unused-import warnings.
- Typecheck: retry passed (first concurrent attempt was killed, exit 137). Scoped changed-file lint passed with zero errors/warnings.
- Final source CI PASS: web-test 41327394494 (including production build and exact-build crawl), migration-governance 41327394460 and Admin RBAC Priority 1 41327394461 on ed36b49b8a7cfb0abad3deec199c801b459cbf7c. PR #1011 merged to main as 249ba09949c079ea3ed6d0e784ab07cb820997f7. Automatic staging bundle run 41328221880 in progress. Staging verification pending. Production unchanged. Closed defects: 0.

Additional baseline items discovered during regression (do not bundle into this metadata slice): SEO-BASELINE-01 sitemap count expectation, SEO-BASELINE-02 historic shalean.com redirect-map parity, SEO-BASELINE-03 supplies-policy copy assertion. Investigate expected behavior before changing source or tests.

Risk: existing metadata can now exceed the old arbitrary 160/68-character limits; preserving complete meaning is intentional. Search engines may still truncate or rewrite displayed snippets. Authored/stored text already truncated cannot be reconstructed by normalization and needs a separate evidence-based editorial correction.

Staging acceptance: inspect the three audited local-service articles, both deep-versus-regular guides, a CMS article, and unchanged service/home controls. Check HTML title/description, OG/Twitter, schema description, canonical, robots, H1 and HTTP status. Capture exact deployment SHA. Confirm no article body, publication state or financial record changed.

Rollback: revert only the app-source metadata commit using the governed release path; retain tracker/history. No database migration or data rollback required.


## Continuation evidence

Owner instructed “Proceed”. Read-only environment checks found staging healthy at source baseline c1585c0, configured to the expected staging database with test Paystack keys and outbound messaging disabled. Production was healthy at fecca6e7a3bfaacb1d13a9d2b3885f2c0dd48e6a. Neither environment contained this fix at the check.

Current workflows confirm `main` builds canonical `deploy/staging`, and `production` builds `deploy/production`; a main merge is not production activation. Preserve the current deployment path and perform the bounded production promotion only after staging verification. The existing PR-preview workflow publishes an isolated artifact and does not activate canonical staging.

## Current progress record

Progress-only branch: `audit/seo-remediation-20261101`; update this tracker after each verified gate without deploying documentation-only status changes. Application source remains governed through normal fix/release PRs.

- Static metadata sweep: 67 routed static articles passed (no generated ellipses, repeated Cape Town suffixes or repeated padding).
- Production candidate is based on fecca6e7a3bfaacb1d13a9d2b3885f2c0dd48e6a; existing metadata source/test files matched the main baseline before applying the exact bounded fix. Its package change only registers the two regression files, preserving the production critical suite. Isolated candidate critical suite: 1,505 passed across 132 files. Typecheck pending.
