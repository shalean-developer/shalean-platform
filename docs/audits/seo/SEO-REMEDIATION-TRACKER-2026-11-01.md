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
| SEO-META-04 | 1 | Location/service title formatter still uses `clipSerpTitle`; inventory actual affected outputs | Closed | Review complete copy and repair independently without changing ranking intent |
| SEO-META-05 | 1 | Booking and cleaner-login canonical inherits homepage | Closed | Appropriate route canonical with intentional noindex preserved; invalid-route redirect intact |
| SEO-META-06 | 1 | Booking social metadata inherits homepage | Closed | Page-specific title/description/URL; no funnel behavior change |
| SEO-META-07 | 1 | Missing initial HTML H1 on booking routes; cleaner-login warning requires rendered check | Closed | Meaningful rendered heading and accessible page name; no duplicate H1 introduced |
| SEO-COPY-01 | 1 | Customer-visible technical wording in navigation/location directory | Closed | Plain customer wording; navigation destinations unchanged |
| SEO-ENV-01 | 1 | Plesk staging public article responses lack a noindex header and emit index/follow metadata | Closed | Deployed staging HTML and early redirects carry noindex; production ordinary pages stay indexable; exact-SHA verification |
| SEO-INDEX-01 | 2 | Stored index inspection: 19 crawled not indexed, 3 discovered not indexed, 22 unknown, 4 historical 404 | Google review reconciled; release and index-outcome follow-up pending | Fresh priority URL inspection, live status reconciliation and individually justified remediation; indexing is not guaranteed |
| SEO-CONTENT-01 | 2 | Earlier 173-page similarity warning; current SiteGuru to-do count 68; live template overlap confirmed | Staging including visual verified; owner production approval pending | Per-cluster editorial/intent evidence and justified retain/differentiate/consolidate decisions; no bulk redirects from scores |
| SEO-CONTENT-02 | 2 | Overlapping deep-versus-regular articles | Direct308 consolidation and visual staging verified; owner production approval pending | Query/content comparison and approved URL disposition; no proven cannibalisation yet |
| SEO-CONTENT-04 | 2 | Misplaced coastal/blanket-price assumptions in 24 local pricing, frequency and checklist FAQs | Closed | Correct visible/schema FAQ copy, dates, CI, deployed staging and approved production reconciliation |
| SEO-CONTENT-03 | 2 | Weak commercial service-page search visibility | Service decision copy staging verified; production and outcome monitoring pending | Intent mapping, verified service details/proof and a dated search/lead baseline |
| SEO-LINK-01 | 3 | Seven reported orphan articles | Closed | Confirm crawl reachability; relevant contextual links to retained pages; no redirects introduced |
| SEO-PERF-01 | 4 | Historical 37/48 sub-90 scores; current stored report 9/40 below 90, device/date absent | Investigating | Fresh controlled lab/field diagnosis; PSI daily quota and GSC Wizard inactive plan limit current measurement |
| SEO-PERF-02 | 4 | Blog index eagerly loads five offscreen card images below its featured content | Closed | Defer card loading while retaining featured preload, complete content/links and rendered layout; deployed verification |
| SEO-LOCAL-01 | 5 | Local Business hours/entity facts, GBP and citations not fully verified | Queued | Verified business facts, schema parity and GBP/citation review |
| SEO-AUTHORITY-01 | 5 | September snapshot: 224 broken backlinks / 3 destinations | Needs refreshed evidence | Fresh source/destination checks before any recovery redirects |
| SEO-MEASURE-01 | 5 | GA sessions −85.7% while GSC clicks −0.5% | Queued | Tracking/channel/deployment/consent reconciliation; not assumed SEO collapse |
| SEO-MEASURE-02 | 5 | Organic enquiry → booking → payment attribution unverified | Queued | Reconcile events and actual funnel evidence without creating financial entries |
| SEO-SCHEMA-01 | 5 | Schema presence checked, full correctness/eligibility pending | Queued | Representative validation and visible-content parity; no unsupported review/FAQ benefit claims |
| SEO-A11Y-01 | 4 | Existing SiteHeader search input reports aria-expanded unsupported for implicit textbox role | Closed | Verify intended search-widget semantics and keyboard behavior; correct ARIA without changing navigation |
| SEO-A11Y-02 | 4 | Escape does not dismiss desktop Services/mobile drawer or restore panel focus | Closed | Escape closes disclosures, restores relevant focus, preserves outside focus/query and existing navigation; browser proof |
| SEO-MOBILE-01 | 4 | Actual phone accessibility/rendering audit outstanding | Investigating | Real rendered mobile behavior, navigation, focus, headings and overflow evidence |

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

Live before/after inventory: 59 URLs (43 locations, seven services, eight booking/login and the location directory). Production baseline captured successfully: all 59 URLs returned 200, with 119 targeted flags (29 clipped titles, 51 pages with shared technical customer copy, eight private canonical mismatches, nine OG-title mismatches, eight OG-URL mismatches, seven OG-description mismatches and seven missing initial H1s). Expected production identity/health remained correct before and after. Evidence: `docs/audits/seo/evidence/SEO-META-SLICE2-BASELINE-2026-11-01.json`. Source CI and deployed staging verification passed; production acceptance is pending. Do not close these five defects from local results.

Acceptance: exact staging SHA/health and test environment; complete service/location titles without generated ellipses; correct private-route self-canonical and matching OG/Twitter metadata; one initial HTML H1; retained private noindex and staging-wide noindex headers; customer copy removed without changing navigation destinations. Compare production after explicit release acceptance, then close only the verified items. Existing manual location title overrides must remain authoritative; any stored clipped override is a separately evidenced data correction, never silently overwritten.

Rollback: bounded revert of this app-only slice through the existing deployment path. No database migration, CMS edit, financial write, indexing submission or analytics change is included. Google may still truncate its displayed title links; the repair preserves meaningful HTML title text (official guidance: https://developers.google.com/search/docs/appearance/title-link).

Slice 2 source PR: #1014, exact head e4ad4918017786171026b3106fd88a7bb93abf4e. All four source workflows passed (web-test 41332652628, booking-v2-closure-smoke 41332652612, migration-governance 41332652575, RBAC 41332652587). Merged to main as 1e8e5629544983a49b58035e5576cab5e6160f4d. Automatic staging build 41333577949 passed. Static title sweep: 129 outputs, maximum length 65, zero ellipses. Existing SiteHeader search-input aria-expanded/role warning is recorded below for the later accessibility pass; this slice only changes its customer caption.


Production candidate #1015 is a draft, based on production e285c89ba306ca87eec0a685773a430babbed133, exact head 125e4183fbccd858ef914ca15739f390660f6516. Local critical suite 1,534 passed across 135 files; TypeScript passed. All five candidate workflows passed, including web-test build/crawl 41333196367. No preview manually activated. Production remains unchanged; this batch is not Closed.


## Slice 2 deployed staging gate — PASS

Automatic staging bundle 41333577949 completed successfully. Plesk subsequently activated exact main SHA 1e8e5629544983a49b58035e5576cab5e6160f4d; an earlier check correctly refused the previous release. Final 59-page live inventory: 59 HTTP-200 responses and zero targeted flags, compared with 119 production-baseline page-level flags. Full location names/no literal ellipses, self-canonicals, matching social titles/URLs, private social descriptions/noindex, one initial H1, customer wording and staging noindex headers all passed. Expected staging SHA, DB identity, test payments, disabled outbound messaging and healthy configuration verified before and after.

Evidence: docs/audits/seo/evidence/SEO-META-SLICE2-STAGING-2026-11-01.json. This is read-only HTML verification; dedicated Booking V2 smoke workflow passed separately without creating bookings. All five production-candidate workflows passed: web-test 41333196367, booking smoke 41333196379, migration 41333196324, RBAC 41333196298, isolated preview 41333196312. Candidate #1015 remains draft/unmerged at 125e4183fbccd858ef914ca15739f390660f6516, awaiting explicit production release acceptance. Production remains e285c89ba306ca87eec0a685773a430babbed133. First four defects remain Closed; these five are Staging verified, not Closed. No search ranking or indexing outcome is claimed.


## Slice 2 production release authorized — deploying

Owner explicitly replied “Approved” to production PR #1015 after the 59-page staging acceptance. Rechecked unchanged candidate head 125e4183fbccd858ef914ca15739f390660f6516 and production base e285c89ba306ca87eec0a685773a430babbed133; all five candidate workflows passed, with no review threads outstanding. PR #1015 merged as 2db35d354b49bf9f4dddc08b6a406635b453f868. Automatic production deployment and read-only reconciliation are pending. The five slice-2 defects remain Staging verified until production proof; four earlier defects remain Closed.


## Slice 2 production reconciliation and closure — PASS

Owner approval: explicit “Approved” for PR #1015. Exact merged/live production SHA: 2db35d354b49bf9f4dddc08b6a406635b453f868. Production bundle run 41334799510 PASS; deploy/production/release-sha.txt and live health both match. Expected production DB identity, live payment mode, normal outbound configuration and healthy environment verified before and after the complete read-only inventory.

All 59 target pages returned HTTP 200 with zero targeted flags, reducing the same inventory's 119 baseline page-level flags to zero. Complete service/location titles, self-canonicals, matching social metadata, one initial H1, customer wording, public indexability and private noindex all passed. Additional live checks confirm all eight private-route Twitter title/description pairs match OG, and staging /locations still returns noindex/nofollow/noimageindex. No booking submission, CMS/database edit, financial record, pricing/auth change, indexing request or analytics configuration change occurred.

Evidence: docs/audits/seo/evidence/SEO-META-SLICE2-PRODUCTION-2026-11-01.json. Candidate checks were green before merge; no independent human reviewer is claimed. Rollback is a bounded source revert through the existing release path, preserving the first batch and staging guard.

Closed after production reconciliation: SEO-META-04, SEO-META-05, SEO-META-06, SEO-META-07 and SEO-COPY-01. Total Closed: 9 (including the first four). Broader SEO audit remains open. Next in the recorded order: fresh indexing evidence and content similarity/overlap diagnosis; no bulk redirects, deletions or indexing submissions are authorized or claimed by this release. No immediate search-ranking outcome is inferred from deployed metadata checks.


## Slice 3 — indexing/content evidence refresh and FAQ accuracy

Owner instructed “proceed” after nine production-verified closures. Live production remains 2db35d354b49bf9f4dddc08b6a406635b453f868. Read-only crawl completed on all 196 public inventory pages: 196 HTTP 200, no request errors, no unexpected noindex or canonical errors (homepage slash normalized), matching SHA/health before and after. All 194 sitemap entries are within the public inventory; /refer and /data-deletion are curated omissions, not automatically defects. Four historical 404s now return 200; their stored Google crawls date from May. No recovery redirect is justified.

SiteGuru stored inventory: 206 rows, including 44 public suspects (19 crawled/not indexed, 3 discovered/not indexed, 18 unknown, 4 historical 404) and ten intentional private/operational exclusions. These are not fresh Google inspections. GSC Wizard refuses all reads for inactive subscription/trial; no inspections, indexing requests, submissions or tool settings changed. Restore the active connector plan/Google connection or supply fresh Search Console evidence. SEO-INDEX-01 remains Needs refreshed evidence.

Current SiteGuru similarity to-do count is 68, versus earlier 173. No causation from our fixes is claimed; per-page similarity report is unavailable through this connector. Independent main-text analysis confirms substantial template repetition; diagnostic pair scores are not Google's duplicate verdict. Both comparison guides have different wording, with raw five-word-shingle Jaccard 0.0169. SiteGuru's 1 August–29 October cannibalization report has zero qualifying queries, subject to its meaningful-click-share filter. No winner/redirect decision made. Seven zero-observed-inbound articles were reproduced across the live 196-page set; linking remains next independently verifiable repair.

Confirmed SEO-CONTENT-04: Claremont price FAQ inherits Atlantic Seaboard/R450 text; Newlands frequency FAQ inherits Atlantic Seaboard advice; inland checklist FAQs assume coastal grit. Prepared source PR #1016, head 4d494349d90cca44f54526a09003a577f48e88ae, against main 1e8e5629544983a49b58035e5576cab5e6160f4d. Only 24 pricing/frequency/checklist FAQ sets and their modification dates change; publication dates, other guides, prices/configuration, routing, canonical, indexability, CMS and booking behavior are preserved. Visible/schema FAQ share one function. Local: 26 focused regressions, 1,647 critical tests across 144 files, TypeScript and scoped lint passed; booking lint passed with four pre-existing unused-import warnings. CI/deployed staging/production pending. Wider SEO-CONTENT-01/02 remain Investigating; no new item Closed. Total Closed remains 9.

Detailed report: docs/audits/seo/SEO-INDEX-CONTENT-REFRESH-2026-11-01.md. Evidence: docs/audits/seo/evidence/SEO-INDEX-CONTENT-REFRESH-2026-11-01.json. Initial crawl was interrupted by workspace loss and was not counted; final checkpointed crawl completed successfully.


FAQ source gate: all three final-head workflows passed (web-test 41337636453 including production build/exact-build crawl, migration 41337636452 and RBAC 41337636310). No base/head drift or outstanding review thread; no independent human reviewer claimed. PR #1016 merged as 15daceeb178cb7a5aef111b28ff32d0d619925c1. Canonical staging deployment is building; no preview manually activated. Isolated production draft #1017, head b4c4764da75ef663270fb00a983beb2f7e5acea5, is based on 2db35d354b49bf9f4dddc08b6a406635b453f868. Candidate critical tests: 1,560 across 136 files; TypeScript passed. Candidate CI pending. Production unchanged. Fresh Google inspection checklist: docs/audits/seo/evidence/SEO-INDEX-PRIORITY-INSPECTIONS-2026-11-01.csv (ten URLs).


## SEO-CONTENT-04 staging acceptance — PASS

Main/staging SHA 15daceeb178cb7a5aef111b28ff32d0d619925c1; automatic staging bundle 41338265076 PASS, artifact release-sha.txt and live health match. All 24 affected guides returned HTTP 200 with the exact corrected visible FAQ text and matching four-question FAQPage entities, correct modification date, one H1, self-canonical and staging noindex. Expected staging database identity, test payments, disabled outbound messaging and healthy exact-SHA environment verified before and after. Evidence: docs/audits/seo/evidence/SEO-LOCAL-GUIDE-FAQ-STAGING-2026-11-01.json.

Existing blog canonical metadata regressions: 9 passed. Production candidate #1017 remains draft/unmerged, base 2db35d354b49bf9f4dddc08b6a406635b453f868, head b4c4764da75ef663270fb00a983beb2f7e5acea5. All four final-head workflows passed: web-test 41337822449, migration 41337822459, RBAC 41337822457 and isolated preview 41337822467. No preview manually activated. Production release acceptance is pending for this bounded FAQ repair; production reconciliation must precede closure. Total Closed remains 9. SEO-INDEX-01 still needs fresh Google evidence; SEO-CONTENT-01/02 remain Investigating and seven orphan-link repairs remain queued in order.


## SEO-CONTENT-04 production release authorized — deploying

Owner replied “yes” to the bounded production PR #1017 approval request. Rechecked unchanged head b4c4764da75ef663270fb00a983beb2f7e5acea5, base 2db35d354b49bf9f4dddc08b6a406635b453f868 and all four green final-head workflows. PR #1017 merged as b8c4145903e3f938dffa89cfafe4bf181bcf2ef1. Automatic production deployment and all-24 read-only reconciliation pending. SEO-CONTENT-04 remains Staging verified; total Closed remains 9. Wider indexing/similarity findings remain open.


## SEO-CONTENT-04 production reconciliation and closure — PASS

Owner explicitly replied “yes” to the bounded PR #1017 production release request. PR merged/deployed as b8c4145903e3f938dffa89cfafe4bf181bcf2ef1. Production bundle run 41339332610 PASS; deploy/production/release-sha.txt and live health match. Correct production DB identity/live payments, normal outbound configuration and healthy exact-SHA environment verified before and after.

All 24 affected guides returned HTTP 200 with the exact corrected visible FAQ answers, matching four-question FAQPage schema, correct modification date, self-canonical, one H1 and public indexability. Zero acceptance errors. Booking remains noindex/nofollow, and the staging guide still returns noindex/nofollow/noimageindex. Evidence: docs/audits/seo/evidence/SEO-LOCAL-GUIDE-FAQ-PRODUCTION-2026-11-01.json.

Closed: SEO-CONTENT-04. Total Closed: 10. This closes the bounded regional/blanket-price FAQ defect, not the wider similarity or indexing findings. No price configuration, booking/auth, CMS/database, financial, analytics, redirect, canonical or indexing-submission changes were made. Rollback: revert only this app-source slice through the release path, preserving earlier repairs. Next independently verified repair: contextual internal links to the seven orphan articles. Fresh Google inspection remains blocked by the GSC Wizard inactive subscription; SEO-INDEX-01 still Needs refreshed evidence and SEO-CONTENT-01/02 remain Investigating.


## SEO-LINK-01 — contextual article repair

Owner instructed “proceed” after SEO-CONTENT-04 production closure. Ten prior defects remain Closed. The completed 196-page public crawl found seven zero-observed-inbound articles. Fresh production baseline on b8c4145903e3f938dffa89cfafe4bf181bcf2ef1: all five proposed parents and seven targets returned HTTP 200, self-canonical, one H1 and public indexability; none of seven proposed edges exists. Exact SHA/environment health verified before and after. Evidence: docs/audits/seo/evidence/SEO-ORPHAN-LINKS-BASELINE-2026-11-01.json.

Source PR #1018, head 8cdd7f57ea3dc25c34f259792da0f3d19a5a7623, based on main 15daceeb178cb7a5aef111b28ff32d0d619925c1. Add seven visible server anchors in relevant deep/regular service introductions and Sea Point/Newlands/Observatory guide sections, using existing SafeInternalLink. Empty CMS cards do not hide the contextual links; disabled programmatic routes are suppressed; unrelated parents render nothing. Article bodies/dates, pricing/booking, CMS/database/financial records, canonical/redirect/robots/sitemap, analytics and indexing submissions unchanged. No client hooks/effects/requests/dependencies added.

Local source validation: 12 focused tests, 1,659 critical tests across 145 files, TypeScript and scoped lint passed. Booking lint passed with four existing unused-import warnings. Production draft #1019, head 4abcb0a75a9388d1f2509daacab198684900ad89, is independently based on b8c4145903e3f938dffa89cfafe4bf181bcf2ef1; original changed files matched main before exact transfer and production test list was preserved with one added path. Production critical suite: 1,572 across 137 files and TypeScript passed. Source/candidate CI and deployed staging verification pending. No new defect Closed.

Acceptance: all 12 affected URLs remain healthy/self-canonical/one H1, all seven contextual anchors present in initial HTML, staging test configuration/noindex preserved; then owner production acceptance, exact-SHA production reconciliation and closure. Rollback: bounded source revert retaining ten prior repairs. Edge map: docs/audits/seo/SEO-ORPHAN-LINKS-2026-11-01.md. Google indexing is not guaranteed; existing fresh-inspection limitation and broader content findings remain open.


Source CI gate PASS: web-test 41340773095 (build/exact-build internal crawl), migration 41340773106 and RBAC 41340773232. No base/head drift or outstanding review thread. PR #1018 merged to main as c609f9d3d8b93a754d3e062cddbd671886316cfb. Automatic staging build 41341517147 running. Production candidate's migration/RBAC/isolated preview passed; web-test pending. Staging acceptance will also check homepage reachability through service/location indexes, adding three crawl controls to the 12 affected pages. Production remains unchanged; ten prior defects Closed.


## SEO-LINK-01 staging acceptance — PASS

Exact main/staging SHA: c609f9d3d8b93a754d3e062cddbd671886316cfb. Automatic staging bundle 41341517147 PASS; artifact release-sha.txt and live health match. All 15 checked URLs passed (five parents, seven articles and homepage/services/locations controls): HTTP 200, self-canonical after normal root-slash normalization, one H1 and staging noindex. All seven contextual edges are present in initial HTML, versus zero on the production baseline. All seven targets have an observed homepage-to-article crawl path in the checked graph. Exact environment/test configuration, expected database identity, disabled outbound messaging and health verified before and after.

Evidence: docs/audits/seo/evidence/SEO-ORPHAN-LINKS-STAGING-2026-11-01.json, including the seven crawl paths. All four production-candidate workflows passed on 4abcb0a75a9388d1f2509daacab198684900ad89: web-test 41340843970, migration 41340844066, RBAC 41340843972 and isolated preview 41340844032. No preview manually activated. Draft #1019 remains unmerged, based on production b8c4145903e3f938dffa89cfafe4bf181bcf2ef1, pending explicit owner production acceptance. No independent human reviewer is claimed. Production reconciliation must precede closure; total Closed remains 10. Wider indexing/content findings remain open and no Google indexing/ranking outcome is inferred.


## SEO-LINK-01 production release authorized — deploying

Owner explicitly replied “Approved” to bounded production PR #1019 after staging acceptance. Rechecked unchanged candidate head 4abcb0a75a9388d1f2509daacab198684900ad89, base b8c4145903e3f938dffa89cfafe4bf181bcf2ef1 and all four final-head green workflows. PR #1019 merged as 05f0f2f5b557f6b10e5cad2db810fb732c1bd371. Automatic production deployment and read-only reconciliation pending. SEO-LINK-01 remains Staging verified; total Closed remains 10. No wider indexing/content closure claimed.


## SEO-LINK-01 production reconciliation and closure — PASS

Owner explicitly replied “Approved” to PR #1019. Production merged/deployed SHA: 05f0f2f5b557f6b10e5cad2db810fb732c1bd371. Production bundle 41342360452 PASS; artifact release-sha.txt and live health match. Correct production database identity, live payment mode, normal outbound configuration, exact SHA and healthy environment verified before and after the read-only crawl.

All 15 checked URLs passed: HTTP 200, self-canonical after normal root-slash normalization, one H1 and public indexability. All seven contextual anchors are present in initial HTML, versus zero of the proposed edges at baseline. All seven previously orphaned targets have observed homepage-to-article crawl paths through the audited public pages. No assertion that every possible site URL is now free of orphaning is made. Booking remains noindex/nofollow; staging location page retains noindex/nofollow/noimageindex.

Evidence: docs/audits/seo/evidence/SEO-ORPHAN-LINKS-PRODUCTION-2026-11-01.json, including all seven paths, 15 URL checks, environment proof and exclusion controls. No article bodies/dates, booking/pricing/auth, CMS/database/financial records, canonical/redirect/robots/sitemap, analytics or indexing submissions changed. Rollback: bounded app-source revert through the release path, preserving earlier repairs.

Closed: SEO-LINK-01. Total Closed: 11. Wider indexing/content findings remain open, with no Google ranking/indexing improvement inferred from this immediate crawl. Next independently actionable order: performance, mobile rendering and accessibility; fresh Google inspection remains constrained by the inactive GSC Wizard subscription.


## Header accessibility and blog loading — source prepared

Owner instructed “Proceed” after eleven production-verified closures. Baselines: main c609f9d3d8b93a754d3e062cddbd671886316cfb, production 05f0f2f5b557f6b10e5cad2db810fb732c1bd371. SiteGuru stored report now contains 40 measured URLs, nine below 90 (historical tracker was 48/37); device/date missing and no attribution to earlier repairs is supported. A new mobile blog PageSpeed API request returned HTTP 429 daily quota exceeded; field data remains unavailable through the previously verified inactive GSC Wizard plan. No current CWV/latency/score improvement claim.

Browser baseline (connected desktop Chrome): width-390 homepage/blog/move-out service/location directory/pricing guide have one H1 and no horizontal overflow. This is viewport emulation, not handset/AT certification. Mobile and desktop Services remain open on Escape. Search input has unsupported aria-expanded without a supporting role; signed-in browser hides the search widget, so active search behavior is covered in component tests. Blog has five eager card images at top positions 2299–5451, all below the 844-high viewport. One initial unchanged staging navigation showed React 412 and recovered after one reload; no recurring cause established. Monitor deployed rendering separately.

Prepared source PR #1020, head d1934bdd9b0c444746af3ecffe3a9473f994314e. Scope: SEO-A11Y-01/02 and SEO-PERF-02 only. Use a real search disclosure button/labelled result region while retaining native search semantics and filtering/Enter behavior. Escape closes header disclosures with contained focus return, query retention and no outside-focus theft. Defer below-featured blog card images and retain featured priority/preload. No content/pricing/booking/auth logic, route/canonical/robots/sitemap, CMS/database/financial, analytics or indexing-submission changes.

Eight focused tests passed. Source critical suite 1,667 across 147 files, TypeScript and scoped lint passed; prior header ARIA warning removed. Booking lint passed with four existing warnings. React review: new key listener exists only while a disclosure is open and is cleaned up; no new requests/dependencies. Production draft #1021, head e065ada7f6dea3dcf618be175b8658a586d8c26b, is independently based on production after original-file parity checks. Candidate critical suite 1,580 across 139 files and TypeScript passed; production test list preserved with two new paths. CI and deployed verification pending; total Closed remains 11.

Acceptance: final-head CI, exact-SHA healthy staging/test environment, valid image/ARIA HTML and desktop/mobile browser Escape/focus/filter/navigation/viewport checks, public UI screenshot. Then explicit owner production acceptance and production reconciliation before closure. Broader SEO-PERF-01/MOBILE-01 remain open. Rollback: bounded source revert preserving earlier repairs. Details: docs/audits/seo/SEO-HEADER-PERFORMANCE-2026-11-01.md. Baseline: docs/audits/seo/evidence/SEO-HEADER-PERFORMANCE-BASELINE-2026-11-01.json.


## Header accessibility and blog loading — source merged, staging deployment pending

Source PR #1020 merged as 66ca83c95d7cebdc514ff5ea1fe4b484bd6fce32 after all required CI passed (web-test 41344343929, migration 41344343910, RBAC 41344343904). Production candidate #1021 remains draft/unmerged at e065ada7f6dea3dcf618be175b8658a586d8c26b; web-test 41344362427, migration 41344362407, RBAC 41344362360 and isolated preview 41344362394 all passed. No independent reviewer is claimed.

Automatic canonical staging workflow 41345152389 is running for exact main SHA 66ca83c95d7cebdc514ff5ea1fe4b484bd6fce32. Checkout is taking longer than the preceding successful run; live job logs are unavailable while running. Existing staging remains healthy at c609f9d3d8b93a754d3e062cddbd671886316cfb. No manual activation or pipeline changes made. Deployed HTML and browser acceptance remain pending; three defects remain Local verified, total Closed remains 11. Production unchanged at 05f0f2f5b557f6b10e5cad2db810fb732c1bd371.


## Staging recovery and visual dismissal defect — correction pending

Workflow 41345152389 attempt 1 was canceled after 17m12s stalled in Git fetch (no build/deploy step ran). Same exact-SHA job retry attempt 2 passed; deploy/staging release-sha.txt and live safe health match 66ca83c95d7cebdc514ff5ea1fe4b484bd6fce32. No deployment workflow or platform changes. Initial HTML / and /blog checks passed status/H1/canonical/noindex/native search semantics/disclosure button. Blog has zero published posts: no live card/preload evidence, conditional coverage only; SSR fixture regression passes, production HTML required before closure.

Browser: mobile Escape returns focus to Open menu, desktop state returns focus to Services. Mobile search Deep→Enter navigates to correct public deep-cleaning service. Width390 home/blog/service/location/pricing guide each one H1/no horizontal overflow; service widths320/768 also fit. No recurrence of baseline React412 across checked pages; existing unrelated extension listener error observed before new activation. Actual handset/AT/CWV remain unverified. Correction to earlier search limitation: desktop field is hidden by existing marketing template CSS/breakpoints, not proven due to sign-in. Component tests cover desktop search; no forced DOM visibility.

Visual acceptance caught SEO-A11Y-02 incomplete: existing marketing hover CSS forces the dismissed aria-hidden=true Services panel visible while cursor stays over trigger. Computed style visibility=visible/opacity=1 contradicted the false expanded state. Gate NO-GO pending bounded CSS correction. Source PR #1022 head 217b20275b7dbf72d4276624ac041d6616dc26cd restricts hover override to aria-hidden=false panels; button opening remains. Eight focused regressions passed again. Production draft #1021 updated to 9bf4f21cf4adb5d8e65554b7d661468a8492e8d2 with same CSS and note; new CI and final live screenshot required. No production approval requested; production unchanged; eleven Closed retained.

Public screenshot: docs/audits/seo/evidence/SEO-HEADER-HOVER-BASELINE-2026-11-01.jpg (cropped to exclude account controls). Initial deployed HTTP evidence: docs/audits/seo/evidence/SEO-HEADER-PERFORMANCE-STAGING-INITIAL-2026-11-01.json. Do not interpret the passing ARIA/state checks as full visual acceptance.


## Final header accessibility staging acceptance — PASS; blog loading — CONDITIONAL PASS

Correction #1022 merged as ecdf2b8ec5e1e949a48bf5cb79350e3556842c59 after final-head web-test41347530017 and migration41347530047 PASS. Automatic staging workflow41348334764 PASS; deploy/staging release-sha.txt and live before/after safe health match exact SHA. Expected staging database, test payments, disabled outbound and no issues verified. Initial homepage/blog HTML: HTTP200, one H1, correct self-canonical, staging noindex, valid search input/disclosure semantics.

Final browser proof at1440x900: Services opens visibly; Escape from Deep Cleaning closes expanded state, aria-hidden=true, computed visibility=hidden and opacity=0 while pointer STILL hovers over trigger; focus returns to Services and route stays /. Public cropped screenshot confirms visual dismissal (baseline hover screenshot retained). At390x844: Deep filter finds correct service; Escape from result hides drawer, returns focus to Open menu, preserves query on reopen; Enter navigates to /services/deep-cleaning-cape-town. Homepage/service oneH1, no horizontal overflow. Initial same-JS staging sweep covered home/blog/service/location/pricing guide at390 and service at320/768. No new app errors or repeat React412 observed; earlier extension-listener noise retained as unrelated observation. Viewport reset. Actual phone/AT/CWV remain unverified.

SEO-A11Y-01/02 are Staging verified, not Closed. SEO-PERF-02 is CI verified: staging blog has ZERO published posts, so actual cards/preload are unavailable. Real page SSR regression with article fixtures verifies policy, but deployed image gate remains CONDITIONAL PASS requiring explicit owner acceptance of the gap and production HTML reconciliation before closure. No CMS fixtures inserted. Correction to the source note's proposed desktop breakpoint test: desktop field is hidden across marketing breakpoints (xl:block plus existing >=80rem hide); active desktop behavior remains component-tested, semantics HTML-verified; mobile behavior browser-verified. This is template CSS, not a sign-in conclusion.

Final production candidate #1021 head9bf4f21cf4adb5d8e65554b7d661468a8492e8d2, production base05f0f2f5b557f6b10e5cad2db810fb732c1bd371. All four final-head workflows PASS: web41347542840, migration41347542752, RBAC41347542786, isolated preview41347542797. Seven bounded files, eight focused tests; source critical1667/147files, candidate1580/139files plus TypeScript/lint evidence retained. Draft/unmerged, no independent reviewer claimed, owner production acceptance pending. Rollback: bounded app-source revert preserving eleven closed repairs. Wider performance/mobile/indexing/content/local/authority/measurement findings remain open.

Evidence: docs/audits/seo/evidence/SEO-HEADER-PERFORMANCE-STAGING-FINAL-2026-11-01.json and SEO-HEADER-PERFORMANCE-STAGING-FINAL-2026-11-01.jpg. Total Closed remains11; no score/latency/ranking/indexing outcome inferred.


## Header accessibility and blog loading — production authorized and deploying

Owner replied “Aprroved” to the explicit PR #1021 production request, including the disclosed empty-staging-blog coverage gap. Rechecked all four candidate final-head workflows PASS, unchanged candidate9bf4f21cf4adb5d8e65554b7d661468a8492e8d2 and production base05f0f2f5b557f6b10e5cad2db810fb732c1bd371. PR #1021 marked ready and merged as3e6659aa596959916df266895214a1429e327137. Automatic production workflow41349191923 running. Verify exact artifact/live SHA, safe production environment, served blog card/preload policy and browser Escape/focus/hover before closing. Three findings remain open; total Closed11. No new scope or data writes authorized by this release.


## Header accessibility and blog loading — production reconciliation and closure — PASS

Owner replied “Aprroved” to PR #1021 including the disclosed staging blog-data coverage limit. Approved candidate9bf4f21cf4adb5d8e65554b7d661468a8492e8d2 merged/deployed as3e6659aa596959916df266895214a1429e327137. Automatic production workflow41349191923 PASS; deploy/production release-sha.txt and exact live SHA match. Correct production database identity, live payment modes, normal outbound configuration, no issues and healthy environment verified before/after HTTP checks and again after browser verification.

Production / and /blog returned200 with one H1, appropriate self-canonical, public indexability and corrected native search/disclosure semantics. All87 blog card image instances are loading=lazy, zero non-lazy cards; featured image preload retained. Connected browser DOM independently confirms87/0. The staging empty-blog coverage gap is now resolved in production. This removes five verified offscreen eager cards from baseline; no current speed/latency/CWV/ranking improvement is inferred.

Browser at1440x900: Services opens; Escape from Deep Cleaning returns focus to Services, expanded=false/aria-hidden=true, computed visibility=hidden/opacity=0 while pointer STILL over trigger; repeated open/Escape cycle passed. Public screenshot confirms. At390x844: Deep filter selects correct service; Escape hides drawer, returns focus to Open menu, preserves Deep on reopen; Enter navigates to /services/deep-cleaning-cape-town. Home/blog one H1, document375 within390. Console errors/warnings empty during observed session; viewport reset. One initial click soon after navigation had no state change, later direct retry and repeat cycle passed without errors; cause not established and observation retained for wider performance monitoring. Desktop field remains hidden by existing marketing CSS; semantics served-HTML verified and behavior component-tested. Actual phone/AT/CWV remain unverified.

Exclusion controls: production /book200 retains meta noindex,nofollow; staging /locations200 retains X-Robots-Tag noindex,nofollow,noimageindex. Public production pages remain indexable. No content/prices, booking/auth logic, CMS/database/financial records, routes/canonical/robots/sitemap, analytics or indexing submissions changed. Rollback: bounded app-source revert through existing release path, preserving earlier repairs; no DB rollback required.

Closed: SEO-A11Y-01, SEO-A11Y-02, SEO-PERF-02. Total Closed14. Broader SEO-PERF-01/MOBILE-01, indexing/content, local/authority/schema/measurement findings remain open. Evidence: docs/audits/seo/evidence/SEO-HEADER-PERFORMANCE-PRODUCTION-2026-11-01.json and SEO-HEADER-PERFORMANCE-PRODUCTION-2026-11-01.jpg. Earlier failed visual gate and baseline screenshot retained; no independent reviewer claimed.


## Indexing/content phase — source and candidate prepared, 1 November 2026

Source PR #1023: 618f5c1d0754cc635714676f05d0c99daa91b943. Production candidate PR #1024: 94c4b43bda51694054caa95d25e72a325960d2c1. Both bounded to22 files. Source local1673 tests/148files, production candidate1586 tests/140files, TypeScript and scoped lint pass. CI/build/crawl and deployed staging verification pending. Fourteen prior Closed findings retained; no new closure or production deployment claimed.

65 similarity pairs covering83 URLs are recorded with individual retain/differentiate rationale in evidence/SEO-CONTENT-SIMILARITY-DISPOSITIONS-2026-11-01.csv. Scores do not prove duplicate search intent. Same-task local guides retain shared processes, corrected local FAQs and canonical coverage links; no unsupported claim that all content is unique or automated scores are eliminated. One independently reviewed same-intent comparison consolidation is prepared to the existing generic canonical guide.

Owner confirmed Airbnb customers provide supplies. Revised SEO copy reflects this. Existing booking helper says company-included; live effect unverified and requires a separate governed dependency check. No booking/price policy changed.

Fresh first-party Google report (updated23October) shows147 indexed and46 not indexed submitted URLs (4 historical404,23 crawled/not indexed,19 discovered/not indexed). Three historical404 carpet articles pass Google live tests; fourth test result unread due Browser connection timeout. Live fetch is not index inclusion. No indexing request, sitemap submission or validation action made. Browser remained unresponsive on retry. Detailed HTTP baseline is being regenerated after transient workspace reset; earlier raw crawl is unavailable, aggregate retained in checkpoint.


## Indexing/content phase — deployed staging verified, 1 November 2026

Source #1023 merged main at6b17a242b10cff3bef00c12f9120a23cc0891d97. Exact-SHA automatic staging build41354871116 passed and health endpoint confirms that release. Staging database uwvnmluiqbczeduzjgse, test payments, outbound disabled and zero environment safety issues. All63 deployed checks pass:50 revised guide pages,7 service pages, generic comparison destination,3controls and2direct308 aliases with query preservation. FAQ source/visible/schema parity, publication/revision dates, service preparation headings, commercial decision text/pricing labels, canonicals, H1 and staging noindex pass. Stage sitemap129URLs excludes old comparison alias and contains terminal; its separate CMS dataset is not the production194URL inventory.

Refreshed detailed production baseline preserved:110/110HTTP200, indexable and self-canonical;65 literal comparisons reproduce17pairs>=0.6 and9>=0.7 five-word Jaccard overlap. This supersedes missing detailed raw baseline with regenerated evidence; no claim of zero content similarity or search gains. Existing generic comparison main-text fingerprint recorded for production reconciliation.

Production candidate #1024 remains draft/unmerged at94c4b43bda51694054caa95d25e72a325960d2c1, base3e6659aa596959916df266895214a1429e327137. All4 final-head workflows pass: web-test41354458501, RBAC41354458676, migration41354458524, isolated preview41354458459. No preview activated. Production remains previous verified release. Rollback is the bounded22-file app change through normal release process; no database change.

BLOCKED: Browser connection did not respond, including a fresh tabs-list retry. Visual review/screenshot and remaining first-party Google inspection work are not complete. Three historical404 Google live fetches pass; fourth result unread. Requested owner reconnect Browser and leave Shalean Search Console open. Complete these checks before presenting production approval. No Google submission/validation action made. No new findings closed; prior14closures retained. SEO-INDEX-01 remains open for final Google-state reconciliation; SEO-CONTENT-01/02/03 await visual acceptance, owner production approval, deployed production verification and reconciliation. Ranking/index outcomes remain external monitoring, not immediate code-test claims.


## Indexing/content phase — Browser gate resolved, 2 November 2026

Browser reconnected. Completed desktop service-section and390x844 mobile checks of regular-service preparation, Claremont local-price guide and retained comparison fallback: readable wrapping and no page-level horizontal overflow in those mobile views. Viewport reset. Public cropped screenshots saved with this record. This resolves the prior visual Browser block; no app-source change or extra code-test cycle was needed.

Read the previously unavailable Sea Point move-out-cost Google live result:1November23:29:03SAST, successful fetch, crawl/indexing allowed and self-declared canonical. Thus all4 historical404 articles have passing live tests; this does not establish index inclusion. Direct Google inspection confirms the retained generic comparison is indexed, last crawled25October16:29:05SAST, Google-selected canonical is inspected URL. Submitted sitemap report: Success,194discovered pages, last read24October.

Captured all23 crawled/not-indexed and19 discovered/not-indexed submitted URL examples from the Google report (still dated23October). Fresh HTTP checks of all42:42/42HTTP200, no redirects, self-canonical and no noindex. The old comparison alias remains200 in production pending this approved release, and will then become the intended direct308. All42 remain subject to Google processing/selection; no blanket index-inclusion claim and no Request indexing/Validate fix/sitemap submission action made.

Source staging remains6b17a242b10cff3bef00c12f9120a23cc0891d97; production remains3e6659aa596959916df266895214a1429e327137. Both health endpoints return200 with zero safety issues. Candidate #1024 unchanged/open/draft, head94c4b43bda51694054caa95d25e72a325960d2c1, same production base; all4 final-head CI workflows reconfirmed success. Stage63-check pass remains valid. Gate: CONDITIONAL PASS — ready for owner production release approval. After approval: merge exact candidate, automatic deploy, verify production content/schema/redirects/sitemap and retained CMS article fingerprint, then reconcile. No new findings Closed; prior14closures preserved. Google index/ranking outcomes remain follow-up, separate from implementation acceptance.
