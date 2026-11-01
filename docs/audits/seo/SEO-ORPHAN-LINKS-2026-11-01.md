# SEO-LINK-01 — contextual article links

Bounded repair under the owner's instruction to proceed with the next ordered SEO item. Main baseline: 15daceeb178cb7a5aef111b28ff32d0d619925c1. Production baseline: b8c4145903e3f938dffa89cfafe4bf181bcf2ef1. Ten prior defects remain Closed.

The completed 196-public-page crawl found seven articles with zero observed inbound anchors. Fresh targeted production baseline: all five parents and seven targets return 200 with self-canonicals, one H1 and indexability; none of the seven proposed edges exists.

| Parent | Target article |
| --- | --- |
| /services/deep-cleaning-cape-town | /blog/how-often-deep-clean-home-cape-town |
| /services/deep-cleaning-cape-town | /blog/cleaning-mistakes-that-make-your-home-dirtier-cape-town |
| /services/standard-cleaning-cape-town | /blog/weekly-cleaning-routine-busy-professionals-cape-town |
| /services/standard-cleaning-cape-town | /blog/is-it-worth-hiring-cleaner-cape-town |
| /locations/sea-point-cleaning-services | /blog/apartment-cleaning-tips-sea-point-cape-town |
| /locations/newlands-cleaning-services | /blog/standard-cleaning-newlands-cape-town |
| /locations/observatory-cleaning-services | /blog/standard-cleaning-observatory-cape-town |

Add visible contextual paragraphs in existing service introductions and matching location-guide sections. Render ordinary server anchors through SafeInternalLink. Preserve available links when CMS guide cards are empty, omit programmatic links when their routes are disabled, and add nothing on unrelated pages. No article body/date, canonical, redirect, robots, sitemap, pricing, booking, CMS/database, financial, analytics or indexing-submission changes.

Regression: 12 focused tests cover seven rendered anchors, three empty-card cases, unrelated pages and disabled programme routes. Registered in the unchanged critical suite. Source critical suite: 1,659 tests passed; scoped lint passed. TypeScript, booking lint, final CI and deployed evidence are recorded in the canonical tracker.

Acceptance: exact healthy staging SHA/test configuration; all 12 URLs HTTP 200, self-canonical and one H1; all seven anchors present in initial HTML, staging excluded. Bounded production candidate is prepared independently from the production baseline. Production owner acceptance precedes deployment; production verification precedes closure. Rollback: revert only this source slice through the existing release path, retaining ten earlier fixes.

This resolves observed crawl reachability in the audited set, not a guarantee of Google indexing/ranking. Fresh Google inspection remains unavailable through the inactive GSC Wizard subscription.

Canonical tracker: https://github.com/shalean-developer/shalean-platform/blob/audit/seo-remediation-20261101/docs/audits/seo/SEO-REMEDIATION-TRACKER-2026-11-01.md
