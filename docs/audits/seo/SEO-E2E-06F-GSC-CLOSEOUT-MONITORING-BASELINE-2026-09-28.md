# SEO-E2E-06F — GSC Closeout / Monitoring Baseline

Date: 2026-09-28  
Base: `integration/shalean-release` after SEO-E2E-06E merge `c7b8a54ccb3a1dc98cef1985f1143fecd0d2a6b3`

## Purpose

Close SEO-E2E-06 without making another round of immediate SEO edits. The next decision should come from Google recrawl/indexation evidence, not from repeatedly changing pages before the previous work has had time to settle.

## Current limitation

Fresh Search Console URL Inspection and performance reads are unavailable through the connected GSC Wizard because that connector currently reports no active subscription/trial. This baseline therefore distinguishes:

- **repository facts** — canonical/indexability/sitemap/route ownership;
- **historical GSC evidence** already stored in the repository;
- **live public crawl evidence** observed on 2026-09-28;
- **future GSC checks** that must be performed after deployment and recrawl.

Do not treat public crawl visibility as equivalent to a Google Search Console indexed verdict.

## Monitoring set

| Page | Closeout state | Next action |
|---|---|---|
| `/cleaning-prices-cape-town` | Corrected pricing authority page | Check GSC after deploy; use manual GSC UI Request Indexing only if still not indexed |
| `/services/deep-cleaning-cape-town` | SEO-E2E-06B complete | Monitor only |
| `/services/carpet-cleaning-cape-town` | SEO-E2E-06C complete | Monitor only |
| `/locations/hout-bay-cleaning-services` | SEO-E2E-06D medium-tier recovery | Monitor only |
| `/locations/claremont-cleaning-services` | Existing high-tier hub preserved | Monitor only |
| `/locations/plumstead-cleaning-services` | SEO-E2E-06D reinforced | Monitor only |
| `/locations/rosebank-cleaning-services` | SEO-E2E-06D medium-tier recovery | Monitor only |
| `/locations/rondebosch-east-cleaning-services` | SEO-E2E-06D medium-tier recovery | Monitor only |
| `/locations/constantia-cleaning-services` | High-tier page preserved in 06E | Monitor only |
| `/locations/bantry-bay-cleaning-services` | SEO-E2E-06E medium-tier strengthening | Monitor only |

All ten paths are expected to remain canonical/indexation-eligible and present in the generated sitemap.

## Historical GSC reference points

Only **observed rows explicitly hard-coded as known GSC samples** are eligible as historical performance baselines in this closeout. The catalog helper also generates synthetic rows for uncovered suburbs from pricing-band averages plus deterministic slug jitter; those estimates must **not** be used for 7/21-day performance deltas.

| Location | Impressions | Clicks | CTR | Avg position | Baseline use |
|---|---:|---:|---:|---:|---|
| Claremont | 890 | 41 | 4.60% | 5.2 | Historical observed sample |
| Plumstead | 620 | 28 | 4.50% | 8.1 | Historical observed sample |

Bantry Bay, Constantia, Rosebank, Hout Bay, and Rondebosch East do not have an observed baseline in `KNOWN_GSC_ROWS`. Any values produced for those suburbs by `buildCatalogGscRows()` are **generated estimates** and are excluded from post-deploy delta calculations. Their first fresh Search Console pull becomes the true baseline.

Older SEO disposition evidence recorded Carpet Cleaning as indexed and Deep Cleaning as requiring indexation/content remediation. Those records are historical only; the 06B/06C changes supersede the page content but not the need for a fresh GSC check after recrawl.

## Live public crawl evidence observed 2026-09-28

All ten production monitoring URLs were freshly opened on 2026-09-28 and returned current HTML snapshots. Hout Bay, Plumstead, Rosebank, and Rondebosch East were explicitly re-opened during PR review so no prior-month snapshot is being used to claim current reachability.

Current crawl observations:
- Cleaning Prices — crawled 2026-09-28
- Deep Cleaning — crawled 2026-09-28
- Carpet Cleaning — crawled 2026-09-28
- Hout Bay — crawled 2026-09-28
- Claremont — crawled 2026-09-28
- Plumstead — crawled 2026-09-28
- Rosebank — crawled 2026-09-28
- Rondebosch East — crawled 2026-09-28
- Constantia — crawled 2026-09-28
- Bantry Bay — crawled 2026-09-28

This proves public reachability/crawlability only. It does **not** replace URL Inspection coverage/indexing verdicts from GSC. CI also seeds all ten paths into the PR-build live internal-link crawl, which requires each seed route to return HTTP 200 before merge.

## Recheck policy

After the SEO-E2E-06 changes are deployed to production:

1. **Do not make another content change immediately.**
2. First GSC review: **at least 7 days after deployment**, unless Google clearly recrawls earlier and exposes a definitive issue.
3. Second GSC review: **around 21 days after deployment** for pages still lagging.
4. For every target, record:
   - URL Inspection verdict
   - coverage state
   - last crawl time
   - page fetch / robots status
   - clicks
   - impressions
   - CTR
   - average position
   - primary query → page ownership
5. Only reopen content work when the page is technically healthy but performance/indexation still fails after the observation window.

## Cleaning Prices special case

For `/cleaning-prices-cape-town`:

- confirm the live corrected page is deployed;
- inspect in GSC;
- if healthy but not indexed, use **Search Console UI → Request Indexing** once;
- do not loop repeated requests;
- do not claim the Search Console API performed a UI Request Indexing action.

## Pass criteria for SEO-E2E-06F

SEO-E2E-06F is complete when:

- the monitoring manifest is committed;
- all ten paths are protected by sitemap/indexation regression coverage;
- no new speculative content edits are introduced;
- the production deployment/recrawl observation window is documented;
- fresh GSC data is treated as the next evidence gate rather than another immediate code change.

At that point, SEO-E2E-06 is **code-complete**, while ranking/indexation outcomes remain a post-deploy monitoring activity.
