# SEO-HS-04 — R350 deployment/index verification

Status: **Pre-deployment verification complete; production/index verification pending**

Branch: `design/rd-public-pages-normalization`

This slice is verification-only. It does not authorize or perform a production deployment, production pricing mutation, or Search Console indexing action.

## Current evidence

### Release/design contract

`apps/web/lib/seo/homePageMeta.ts` on `integration/shalean-release` and `design/rd-public-pages-normalization` declares:

- `HOME_STARTING_PRICE_ZAR = 350`
- homepage H1 / WebPage name: `Cleaning Services Cape Town from R350`
- SERP title: `Cleaning Services Cape Town from R350 | Shalean`
- meta description also derives its `R350` value from the same constant.

`apps/web/lib/home/data.ts` compares the active homepage pricing-catalog minimum with `HOME_STARTING_PRICE_ZAR`. In CI/development it throws when catalog data is available and the values differ. In production it logs a mismatch rather than failing the page.

### Non-production catalogue evidence

`supabase/seeds/nonprod/env03_catalog_and_fixtures.sql` seeds the Standard Cleaning pricing row at **R350**. This is useful release/test evidence, but it is explicitly non-production and must not be treated as proof of the live pricing authority.

### Current production baseline

`main` still declares the homepage headline as `Cleaning Services Cape Town from R250`.

The live homepage currently renders/crawls with:

- H1: `Cleaning Services Cape Town from R250`
- Standard Cleaning: `From R250`
- Airbnb Turnover: `From R250`

Therefore the R250 → R350 change is a real release migration, not merely a copy cleanup.

## Production pricing authority gate

Before an R350 homepage deployment is authorized, verify read-only that the production pricing authority used by checkout has a minimum active homepage service base price of **R350** (and that Standard Cleaning is R350 if it remains the lead service).

The connected database projects available during this audit did not expose the production `pricing_services` authority used by the live site, so this check remains unresolved. No production data was changed.

A dedicated R250 → R350 production base-price migration was not evident from the current release migration listing; the R350 fixture found is explicitly non-production. Production pricing may be administered separately, so the release must verify the live authority directly rather than infer it from seeds.

## Release rule

Do **not** deploy homepage SEO that says `from R350` while checkout or the public service catalogue still starts at R250.

At release time, use one of these paths:

1. If the authorized production pricing authority is already R350, deploy the release and continue with the post-deploy checks below.
2. If production still starts at R250, keep the public SEO contract at R250 until a separately authorized pricing change moves the canonical production price to R350.

Do not mutate production pricing as part of this SEO slice.

## Immediate post-deploy verification

After an authorized deployment, verify the production homepage directly:

- HTTP 200 and canonical `/`
- `<title>` contains `Cleaning Services Cape Town from R350 | Shalean`
- H1 contains `Cleaning Services Cape Town from R350`
- meta description contains `from R350`
- Open Graph/Twitter metadata use the same homepage title/description contract
- WebPage JSON-LD name contains `Cleaning Services Cape Town from R350`
- visible Standard Cleaning/public catalogue pricing does not contradict the R350 lead price
- booking flow/checkout calculates from the same current pricing authority

Any R250/R350 contradiction is a release blocker.

## Index verification

Google's current public result still reflects the R250 production page. That is expected before the R350 release.

After deployment:

1. confirm Googlebot can crawl the canonical homepage;
2. inspect/request indexing in Search Console when the connected GSC capability is available;
3. monitor the canonical homepage until Google's observed title/snippet reflects the new R350 contract;
4. do not interpret normal recrawl lag as a deployment failure if the live HTML is already correct;
5. investigate if Google continues to expose R250 after a reasonable recrawl window while live HTML and structured data are R350.

## Acceptance state

Pre-deployment code/contract verification: **PASS**

Production pricing-authority verification: **PENDING**

Production deployment: **NOT AUTHORIZED / NOT PERFORMED**

Google recrawl/index verification: **PENDING POST-DEPLOYMENT**
