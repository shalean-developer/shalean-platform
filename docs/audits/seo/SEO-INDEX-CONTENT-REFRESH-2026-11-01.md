# Indexing and content evidence refresh — 1 November 2026

Scope: continuation of the owner's ordered SEO remediation, after nine production-verified closures. Production observed at 2db35d354b49bf9f4dddc08b6a406635b453f868. No indexing submission, redirect, CMS record, financial record or production source was changed by this investigation.

## Verified evidence

- SiteGuru get_seo_report(indexation, all), retrieved this session: 206 stored rows. Derived coverage counts: 152 submitted/indexed, 19 crawled/not indexed, 3 discovered/not indexed, 22 unknown, 4 historical 404 and 6 noindex exclusions. Ten routes have intentional operational noindex/robots exclusions. The public suspect subset is 44 (19 crawled, 3 discovered, 18 unknown and 4 historical 404). These are stored Google states, not fresh URL Inspection results.
- Live read-only crawl: all 196 public inventory URLs returned HTTP 200, no request errors, no unexpected noindex and no canonical mismatch after normalizing the homepage root slash. Production SHA/health matched before and after. All 194 live sitemap entries match audited public pages; /refer and /data-deletion are the two inventory pages omitted from the curated sitemap. Omission of these utility pages alone is not a defect.
- The four stored 404s now return 200 with self-canonicals. Stored Google crawl dates are 19–23 May. Do not add recovery redirects to working URLs based on that history.
- SiteGuru's current to-do list reports 68 similar-content pages; earlier tracker snapshot was 173. The connector cannot expose that report's per-page rows, and other stored fields retain old metadata. No attribution of the changed count to our work is supported.
- SiteGuru get_keyword_cannibalization, 1 August–29 October 2026, reports zero qualifying keywords. Its meaningful-click-share filter can miss low-volume/zero-click overlap; this does not prove absence of competing intent.
- Both deep-versus-regular guides are live, indexable and self-canonical. The shorter CMS URL has a stored indexed verdict with 24 August last crawl; the Cape Town guide has a stored crawled/not-indexed verdict with 13 July last crawl. Their main-text five-word-shingle Jaccard similarity is 0.0169 raw / 0.0021 after filtering globally frequent shingles. They share broad intent but are not near-identical wording. No winner/redirect decision is justified from current evidence.
- Live link extraction across the 196-page set confirms the same seven reported orphan articles have zero observed inbound anchors. This is a bounded crawl finding, not proof that no URL elsewhere links to them.

## Content diagnosis

A five-word-shingle comparison of extracted main text found 198 candidate pairs at a diagnostic threshold of raw or filtered Jaccard >=0.55. This is an analyst-selected review threshold, not Google's duplicate classification, a penalty, or a count of defects. Scripts/styles/nav/footer/aside/forms were excluded. Globally frequent shingles (present in >=39 of 196 documents) were filtered for a second score. Main content still contains some recommendations and shared CTAs, so scores require editorial inspection.

Top candidate: Claremont/Newlands deep-cleaning checklist guides (raw 0.7675, filtered 0.6733). Cross-service example: Green Point carpet/standard guides (raw 0.7347, filtered 0.6731). Existing templates reuse large advice/CTA sections; changing names alone will not establish distinct value. Preserve working URLs until actual intent, useful local/service evidence and fresh Google data support a disposition.

## Confirmed bounded repair — SEO-CONTENT-04

Claremont pricing FAQ says “Atlantic Seaboard” and a blanket R450 starting point while its title/body use a different local planning band. Newlands frequency FAQ also substitutes Atlantic Seaboard advice. Deep-checklist FAQs assume coastal grit for inland properties. Source: shared getLocalGuideFaqEntities in programmaticPosts.ts; the visible FAQ and FAQPage graph both consume this function.

Repair only the 24 live pricing/frequency/deep-checklist guide FAQs: replace the misplaced regional claims and universal price estimate with property/scope-based guidance, clarify illustrative price ranges versus the selected booking total, and make balcony scope conditional on the property. No new local facts or prices are invented. Update modification dates only for those 24 guides, retaining publication dates and untouched article dates. No title/canonical/redirect/indexability/booking or CMS changes. This repair does not resolve the broader 68-page similarity warning.

Acceptance: all 24 generated outputs free of the misplaced claims; visible FAQ/schema parity; correct canonical, HTTP 200, one H1 and staging noindex; candidate critical tests, lint and TypeScript; bounded production release only after concrete staging verification and owner acceptance. Rollback: revert only this source slice, retaining the nine prior fixes.

## Genuine limitations and next actions

GSC Wizard refuses all reads because its account has no active trial/subscription. No quota was spent and no inspection/indexing request was sent. Fresh inspection can be supplied from Search Console itself or after restoring that connector's active plan and Google connection. Priority ten: four historical 404 URLs, both comparison guides, window-cleaning service and the three discovered/not-indexed guides. Preserve last-crawl dates and Google/user canonicals in that evidence.

SEO-INDEX-01 remains Needs refreshed evidence. SEO-CONTENT-01/02 remain Investigating. Do not infer a content-quality verdict merely from crawled/not-indexed status. Seven contextual internal-link repairs remain the next independently verifiable work item after this bounded FAQ correction.

Evidence JSON accompanies this report. Official interpretation references:
https://support.google.com/webmasters/answer/9012289/
https://support.google.com/webmasters/answer/7440203
https://developers.google.com/search/docs/crawling-indexing/canonicalization
