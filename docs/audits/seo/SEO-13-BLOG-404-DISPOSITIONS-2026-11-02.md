# SEO-INDEX-01 — Thirteen historical blog 404 dispositions (2 November 2026)

## Source of truth
Google Search Console Page indexing report last updated 2026-10-23. These 13 URLs were in its 170 historical 404 examples. The spring-cleaning checklist was recovered separately and is closed. A read-only production Supabase blog_posts query confirmed none of these 13 original slugs is currently published under the exact slug, though other existing published articles share some topics. This is **not** proof that each historical URL was equivalent to a current article; no bulk redirects or duplicate posts are authorized.

## URL-level disposition

| Historical slug (under /blog/) | Existing relevant published CMS title/slug | Audit decision |
| --- | --- | --- |
| clean-high-touch-surfaces-effectively | safe-kitchen-cleaning-hygiene (narrower) | HOLD: no proven equivalent; retain 404 |
| remove-tough-stains-carpets-rugs | carpet-cleaning-step-by-step-guide (broader) | HOLD: check specific stain-removal coverage before redirect |
| choose-eco-friendly-cleaning-products | best-natural-cleaning-products, sustainable-cleaning-practices-cape-town | HOLD: compare product-selection intent |
| prepare-home-before-cleaner-arrives | how-to-prepare-home-before-cleaner-arrives-cape-town | HIGH-CONFIDENCE **candidate**, verify legacy and target content before a single 308 |
| the-benefits-of-eco-friendly-cleaning-products | sustainable-cleaning-practices-cape-town | HOLD: benefits vs general practice not proven equal |
| home-cleaning-tips-for-pet-owners | pet-friendly-cleaning-tips | HIGH-CONFIDENCE **candidate**, compare content and target 200 before redirect |
| best-bathroom-cleaning-tips | bathroom-mould-tiles-grout (narrower) | HOLD: not equivalent |
| carpet-cleaning-durbanville-cape-town | carpet-cleaning-step-by-step-guide / carpet-cleaning-cost-cape-town (not location-specific) | HOLD: no proved location-specific equivalent |
| carpet-cleaning-constantia-cape-town | same general carpet guides | HOLD: no proved location-specific equivalent |
| move-out-cleaning-cost-sea-point-cape-town | move-out-cleaning-checklist-cape-town-tenants (different intent) | HOLD: pricing vs checklist different |
| carpet-cleaning-green-point-cape-town | same general carpet guides | HOLD: no proved location-specific equivalent |
| office-cleaning-vs-home-cleaning | office-cleaning-guide-cape-town (not explicit comparison) | HOLD: compare actual content, no automatic redirect |
| keep-kitchen-hygienic-between-deep-cleans | safe-kitchen-cleaning-hygiene | CANDIDATE pending check that maintenance intent matches |

## Rules and next verification gate
1. Read the historical content if recoverable (archive, old seed or CMS revision), compare topics and primary user intent with current published article; do not infer equivalence from names alone.
2. Verify prospective terminal HTTP 200, declared canonical and ordinary production indexability. Confirm redirects do not duplicate existing source mappings or lead into redirect chains.
3. Recover only sufficiently equivalent URLs in an isolated PR with exact regression tests, then staging acceptance, production isolation, reconciliation and tracker closure.
4. Preserve legitimate 404/410 responses where the original content is retired and no equivalent exists. Search Console 170 count is historical and does not change until Google recrawls.

No CMS/website/financial changes or indexing submissions in this documentation-only audit.
