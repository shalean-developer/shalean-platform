# Shalean SEO remediation tracker — 1 November 2026

## Authority and workflow

Owner instruction: “Lets start fixing as per your order. track them as we fix so that we know what we are fixing.” This admits bounded fixes to verified existing behavior, not a new redesign programme. Existing release-control rules and historical SEO evidence remain in force. No financial, booking-state, CMS-record, authentication, redirect or indexing submission changes are included in the first slice.

Lifecycle: Audit → defect → source of truth → fix → regression → staging → verify → merge → production → reconcile → close. A source fix is never marked Closed. Status values: Queued, Investigating, Source prepared, Local verified, CI verified, Staging verified, Production verified, Closed, Not a defect, Needs refreshed evidence.

Source baseline: main `c1585c0ffcefbe698371c1f309a3ceaf4ab508ae`. Fresh branch `fix/seo-metadata-20261101`. This file is the canonical tracker for this bounded remediation; it does not replace earlier audit or programme trackers.

## Ordered register

| ID | Order | Finding / scope | Status | Closure evidence required |
| --- | --- | --- | --- | --- |
| SEO-META-01 | 1 | Repeated description padding: Newlands/Observatory standard cleaning and Constantia carpet cleaning live examples; shared `metaDescription.ts` | Closed | HTML/OG/schema descriptions have no repeated generated padding; concise authored copy retained; staging and production verified |
| SEO-META-02 | 1 | Blog titles/descriptions cut to literal ellipses; shared description clamp and blog title formatter | Closed | Complete authored wording in HTML, OG/Twitter and schema; no newly generated ellipses; verify CMS and static examples |
| SEO-META-03 | 1 | Blog formatter appends Cape Town/brand/year to already qualified headlines | Closed | Location/brand not appended twice; existing dates retained; no automatic current-year freshness claim |
| SEO-META-04 | 1 | Location/service title formatter still uses `clipSerpTitle`; inventory actual affected outputs | Local verified | Review complete copy and repair independently without changing ranking intent |
| SEO-META-05 | 1 | Booking and cleaner-login canonical inherits homepage | Local verified | Appropriate route canonical with intentional noindex preserved; invalid-route redirect intact |
| SEO-META-06 | 1 | Booking social metadata inherits homepage | Local verified | Page-specific title/description/URL; no funnel behavior change |
| SEO-META-07 | 1 | Missing initial HTML H1 on booking routes; cleaner-login warning requires rendered check | Local verified | Meaningful rendered heading and accessible page name; no duplicate H1 introduced |
| SEO-COPY-01 | 1 | Customer-visible technical wording in navigation/location directory | Local verified | Plain customer wording; navigation destinations unchanged |
| SEO-ENV-01 | 1 | Plesk staging public article responses lack a noindex header and emit index/follow metadata | Closed | Deployed staging HTML and early redirects carry noindex; production ordinary pages stay indexable; exact-SHA verification |
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
- Final source CI PASS: web-test 41327394494 (including production build and exact-build crawl), migration-governance 41327394460 and Admin RBAC Priority 1 41327394461 on ed36b49b8a7cfb0abad3deec199c801b459cbf7c. PR #1011 merged to main as 249ba09949c079ea3ed6d0e784ab07cb820997f7. Automatic staging bundle run 41328221880 PASS. Live staging SHA 249ba09949c079ea3ed6d0e784ab07cb820997f7 verified with expected staging DB, test payments and disabled messaging. Five article metadata checks passed; initial gate held for SEO-ENV-01; final staging gate subsequently passed on 77f77a314cebed28fa65284ad766915206ac94f8. Production unchanged. Closed defects: 0.

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
- Production candidate is based on fecca6e7a3bfaacb1d13a9d2b3885f2c0dd48e6a; existing metadata source/test files matched the main baseline before applying the exact bounded fix. Its package change only registers the two regression files, preserving the production critical suite. Isolated candidate critical suite: 1,505 passed across 132 files. Typecheck passed.

## SEO-ENV-01 — staging safety prerequisite

Live evidence on metadata SHA 249ba09949c079ea3ed6d0e784ab07cb820997f7: all five sampled public article responses had meta robots `index, follow` and no X-Robots-Tag. The existing proxy guard checked NODE_ENV and VERCEL_ENV, overlooking SHALEAN_APP_ENV=staging on Plesk production builds. Root metadata exclusions are overridden by page-specific marketing metadata. This is pre-existing code, unchanged in #1011.

Bounded repair reuses the existing authoritative `isNonProductionDeployment` resolver and applies the header after the proxy wrapper, covering early redirects and session-error passthrough. Existing production transactional and preview-token exclusions remain intact. Ten actual proxy-response tests passed, including production indexability, Plesk staging/development/preview/local, Vercel conflict, redirects, and error handling. Registered in the critical suite. No robots.txt, canonical, page content or remote environment configuration changes.

Metadata runtime checks: Newlands standard, Observatory standard, Constantia carpet, move-out checklist and deep-versus-regular Cape Town guide all returned 200 with complete title/description, matching OG/Twitter/schema descriptions, canonical path and one H1. Staging's intentional `| STAGING` title suffix is expected. Missing `/blog/deep-cleaning-vs-regular-cleaning` is a staging content-availability limitation; production has that CMS-backed route. No staging CMS fixture or production content was changed. CMS-specific deployed verification remains limited to available content; helper regressions cover metadata precedence.

Rollback: revert only the environment-guard commit through the existing app release path; keep staging excluded by a separately verified platform rule if that repair is ever rolled back. Do not add noindex to production.

Guard local critical suite: 1,602 passed across 141 files. Changed proxy/test lint passed with zero errors/warnings. Typecheck passed.

SEO-ENV-01 source prepared in PR #1012, exact head 01774280501b58385c75a780cfdd2334ccb934e0. Final CI PASS (web-test 41329148456, migration-governance 41329148457, Admin RBAC Priority 1 41329148464). Merged as 77f77a314cebed28fa65284ad766915206ac94f8. Staging bundle run 41329992800 PASS. Live staging SHA 77f77a314cebed28fa65284ad766915206ac94f8 passed five article metadata/noindex checks plus two actual proxy redirects. Environment health/safety remained correct before and after.

Production candidate PR #1013, head 39f3e682d230c154acf040262edfd4f1b370d548, was owner-approved and merged to production as e285c89ba306ca87eec0a685773a430babbed133. All four candidate workflows passed: web-test 41329469851, migration-governance 41329469807, RBAC 41329469845 and isolated preview 41329469847. Final local combined candidate: 1,515 critical tests across 133 files and TypeScript passed. No preview was manually activated over canonical staging. Final staging acceptance evidence PASS; owner explicitly approved the bounded production release; deployment run 41330836013 completed and production reconciliation passed below.

## Final staging gate — PASS

Exact live staging SHA: 77f77a314cebed28fa65284ad766915206ac94f8. Expected staging database identity, test payments, disabled outbound messaging and healthy environment verified before and after the five article checks. All five returned 200, one H1, complete title/description, correct canonical, matching OG/Twitter/schema descriptions and X-Robots-Tag noindex. The intentional staging title suffix remained. Actual proxy redirects `/location/cape-town/sea-point` and `/cleaning-services/sea-point` returned 308 to the expected hub with noindex/nofollow/noimageindex.

Evidence: `docs/audits/seo/evidence/SEO-META-STAGING-2026-11-01.json`. Framework-configured `/c/:slug` redirects run before the proxy and are outside this proxy-header scope; their destination HTML is protected. The unavailable staging CMS comparison article remains a disclosed coverage limitation and must be included in production reconciliation.

Production control remained healthy at fecca6e7a3bfaacb1d13a9d2b3885f2c0dd48e6a, with ordinary article HTTP 200, robots index/follow and no noindex response header. Production unchanged. PR #1013 contains the bounded, locally tested candidate and all four final-head CI workflows passed. Owner production release acceptance was explicitly granted; exact-SHA deployment and production reconciliation are now completed below. Closed defects: 0; do not begin the next repair slice until this release is reconciled and closed.

## Production release authorized — deploying

Owner explicitly replied “approved” to the bounded PR #1013 release summary. Reverified candidate head 39f3e682d230c154acf040262edfd4f1b370d548 and all four green workflows; no base/head drift. PR #1013 merged as e285c89ba306ca87eec0a685773a430babbed133. Automatic production bundle run 41330836013 completed successfully. Rollback source remains fecca6e7a3bfaacb1d13a9d2b3885f2c0dd48e6a.

Pre-release live baseline: fecca6e7 with correct production environment, live payment mode and healthy app. Six article checks reproduced 15 metadata flags (generated title ellipses/location repeats/padding and truncated descriptions), including the CMS-rendered comparison article. At that checkpoint post-release reconciliation was pending and no defect was Closed.

## Production reconciliation and first-batch closure — PASS

Owner approval: explicit “approved” after the bounded production release summary. PR #1013 merged/deployed as e285c89ba306ca87eec0a685773a430babbed133. Production bundle run 41330836013 PASS; deploy/production release-sha.txt and live environment SHA both match. Correct production database identity/live payment mode, normal outbound configuration and healthy app verified before and after the six article checks.

All six affected articles returned 200 with one H1, complete title/description, matching OG/Twitter/schema descriptions, correct canonical path and production indexability. Fifteen pre-release metadata flags reduced to zero. The previously unavailable staging CMS comparison article rendered from CMS on production and passed, resolving that coverage gap for this release.

Controls: homepage and deep-cleaning service remain HTTP 200 and index/follow without a noindex response header. Booking remains HTTP 200 and noindex/nofollow; its known homepage canonical remains queued as SEO-META-05. Staging article still sends noindex/nofollow/noimageindex. No CMS records, article bodies, financial records, indexing submissions or analytics configuration were edited by this work.

Evidence: `docs/audits/seo/evidence/SEO-META-PRODUCTION-2026-11-01.json` contains before/after article observations, exact SHA, deployment run and controls.

Closed after production reconciliation: SEO-META-01, SEO-META-02, SEO-META-03 and SEO-ENV-01. Current closed count: 4. The broader SEO audit remains open; no ranking/indexing improvement is claimed from immediate deployment. Next queued work is SEO-META-04 through SEO-META-07 and SEO-COPY-01, followed by the already recorded indexing/content, linking, performance and authority/measurement order. No next-slice implementation is included in this release.

## Slice 2 — remaining titles, transactional metadata/headings and customer copy

Owner instructed “proceed” after first-batch production closure. Scope is SEO-META-04/05/06/07 and SEO-COPY-01 only. Current source baseline main 77f77a314cebed28fa65284ad766915206ac94f8; production baseline e285c89ba306ca87eec0a685773a430babbed133. The first four closed defects remain closed.

Changes: title generators select complete concise alternatives rather than publishing ellipses or partial place names. Legacy clipSerpTitle export normalizes whitespace without slicing. All eight booking/login routes receive a self-canonical and page-specific OG/Twitter title/description while retaining noindex/nofollow. Six service booking routes render a screen-reader heading outside the loading client shell; cleaner login loading fallback gets the same heading as the existing ready form, avoiding duplicate headings. Navigation/location-directory copy uses customer language; hrefs, booking controls, forms, pricing, authentication, data, redirects, and prior staging exclusion are unchanged.

Validation: 30 focused tests passed, including every one of 43 configured locations across all three title variants (129 generated outputs), six service metadata/SSR heading cases, query privacy, invalid-service redirect and cleaner login loading/ready states. Full critical suite: 1,621 passed across 143 files. TypeScript passed. Scoped lint passed with one pre-existing SiteHeader search-field ARIA warning; enforced booking lint passed with the four existing unused-import warnings. Broader SEO/blog suite: 510 passed and the same four baseline failures (sitemap count, two historical shalean.com redirect-map checks, supplies-policy copy); no tests/guards suppressed. React checklist: no new hooks, effects, requests or dependencies; headings are accessible and client booking control flow is unchanged.

Live before/after inventory: 59 URLs (43 locations, seven services, eight booking/login and the location directory). Production baseline captured successfully: all 59 URLs returned 200, with 119 targeted flags (29 clipped titles, 51 pages with shared technical customer copy, eight private canonical mismatches, nine OG-title mismatches, eight OG-URL mismatches, seven OG-description mismatches and seven missing initial H1s). Expected production identity/health remained correct before and after. Evidence: `docs/audits/seo/evidence/SEO-META-SLICE2-BASELINE-2026-11-01.json`. CI, deployed staging verification and production acceptance are pending. Do not close these five defects from local results.

Acceptance: exact staging SHA/health and test environment; complete service/location titles without generated ellipses; correct private-route self-canonical and matching OG/Twitter metadata; one initial HTML H1; retained private noindex and staging-wide noindex headers; customer copy removed without changing navigation destinations. Compare production after explicit release acceptance, then close only the verified items. Existing manual location title overrides must remain authoritative; any stored clipped override is a separately evidenced data correction, never silently overwritten.

Rollback: bounded revert of this app-only slice through the existing deployment path. No database migration, CMS edit, financial write, indexing submission or analytics change is included. Google may still truncate its displayed title links; the repair preserves meaningful HTML title text (official guidance: https://developers.google.com/search/docs/appearance/title-link).


## 2 November 2026 — three historical 404 URL repairs: production reconciled

Production release: isolated PR #1034 merged as `055934868474a2415a9a6874a6ea8cae385bbbdb` (owner-supplied health response verified this exact active production release SHA, correct production Supabase and Paystack LIVE mode, `issues: []`). Final owner-supplied HTTP checks on `shalean.co.za`:

| Historical URL | Result | Existing destination | Destination status |
| --- | --- | --- | --- |
| `/services/one-time-cleaning` | 308 | `/services/standard-cleaning-cape-town` | 200 |
| `/blog/spring-cleaning-checklist-south-africa` | 308 | `/blog/spring-cleaning-checklist-cape-town` | 200 |
| `/booking/quote` | 308 | `/quote` | 200 |

No unexpected `X-Robots-Tag` response headers in the supplied production output. Prior to release, production CMS read-only inspection confirmed the existing spring-cleaning article was published, `noindex=false` and canonical set to its live URL. Owner's read-only PowerShell verified that the destination returned HTTP 200 and HTML `<link rel="canonical" href="https://shalean.co.za/blog/spring-cleaning-checklist-cape-town"/>`. Staging on `cdbdad5581634c45ab4734799f30eab9cd5308f8` confirmed all three 308 sources and 200 service/quote destinations; the CMS article destination was unavailable only in staging because its separate database has no article row. That limitation was disclosed and production destination checked independently before isolated promotion. CI gates passed on PRs #1031 and #1034. No duplicate content created and no CMS, customer, booking or financial writes made.

**Disposition: these three historical 404 repairs Closed after production reconciliation.** They are a verified subset of the historical 170-URL 404 cohort, **not** closure of the complete 404 or SEO-INDEX-01 work. Google's page indexing report was last updated 2026-10-23, and Google recrawl/indexing results following this release are still pending. Do not claim Google's indexed/excluded URL counts have changed based solely on this deploy.
