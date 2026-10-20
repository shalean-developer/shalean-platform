# SEO-LIVE-LINKS-01 — broken article links

Status: prepared locally; not published, deployed or applied to production.
Authority: Farai's 20 October 2026 instruction to proceed carefully with the live SEO assessment, following the existing staged audit process.

## Exact scope

| Broken destination | Repair |
| --- | --- |
| `/services/carpet-cleaning` | Render article links directly to `/services/carpet-cleaning-cape-town`; recover old requests with an exact 308 redirect. |
| `/services/move-out-cleaning` | Render article links directly to `/services/move-out-cleaning-cape-town`; recover old requests with an exact 308 redirect. |
| `/services/window-cleaning` | Render article links directly to `/services/window-cleaning-cape-town`; recover old requests with an exact 308 redirect. |
| `/blog/remove-kitchen-grease-without-damaging-surfaces` | Remove the single Helpful Shalean guides item pointing to this draft from the published cleaning-mistakes article. Do not publish or redirect the draft. |

The application fix extends the existing exact marketing redirect matrix and shared editorial href normalizer. Matching preserves query strings and fragments. Existing canonical destinations, unrelated child paths, external hosts and booking/account/API paths have regression coverage.

The separate CMS correction is in `scripts/audits/seo-unpublished-article-link.sql`. It defaults to ROLLBACK. It locks and checks the exact published source and draft destination, requires the reviewed content hash and block/link positions, and changes only one `content_json` element. It fails closed on changed source content, a missing row, an already-applied correction, or a destination no longer in draft.

## Baseline and evidence

- Repository main and live staging: `573cc0d707cae1ab6dd0dc0ee138babf19a40499`.
- Production branch and live production: `3386c6e5f6d5737ec0814963f5c8c9f8e1c5afd3`.
- Live short service destinations returned 404; corresponding Cape Town canonical destinations returned 200.
- SiteGuru reported four broken destinations across seven articles. Direct HTTP inspection confirmed the affected service anchors in the carpet-frequency and window-cost articles.
- Production CMS read confirmed that `cleaning-mistakes-cape-town-homeowners` is published and its helpful links include the unpublished kitchen-grease draft. Source content hash: `67c205926d0be799d7d31e92d888005f`.
- Staging has the blog table but no matching CMS source/draft rows. No ad-hoc staging rows were inserted.
- No live CMS mutation was executed.

## Validation completed

- Four focused test files: 36 tests passed, including HTML and Markdown links, absolute internal URLs, query/hash preservation, canonical paths, external links, unrelated child paths, booking/account/API paths and sitemap rules.
- Critical suite: 128 files / 1,486 tests passed.
- TypeScript check passed.
- Booking-core ESLint gate passed with zero errors and four existing warnings.
- Blog route governance and static internal-link audit passed. The scripts were executed with `node --import tsx` because the `tsx` CLI's IPC socket is unavailable in this environment; script content and assertions were unchanged.
- Exact public CMS JSON tested in isolated PGlite 0.5.10: rollback preserves all rows; simulated apply removes exactly one link and preserves article text/metadata/other links/other rows; stale content fails closed; a newly published destination fails closed.
- Isolated post-correction hash: `bde0cf46162b57b84b221cd066e29f52`; helpful links change from 9 to 8.
- `git diff --check` passed.

## Remaining release gates

1. Publishing the prepared changes to the public `shalean-developer/shalean-platform` repository and opening the PR were explicitly authorized by Farai on 20 October 2026 after the initial automatic approval rejection. Continue with the approved destination and scope.
2. Open the narrow PR, pass the required final-head CI and independent review, and merge through the existing staging workflow.
3. Verify the live staging release SHA and three exact redirects, canonical destinations, query/hash handling, rendered article-link normalization and representative booking controls. Verify the CMS fixture in an isolated preview or through approved staging fixture tooling before applying its correction.
4. Create a bounded production promotion from the current production branch containing only this change. Do not promote unrelated pending main changes. Repeat required final-head CI/review and verify live production SHA after automatic deployment.
5. Re-read the published CMS source and draft status. Rehearse the reviewed SQL and apply only with valid scope, fresh source match and the completed prior gates. Verify the rendered source article and unchanged article/metadata fields.
6. Reconcile all seven affected articles and all four broken link destinations; record actual release and CMS receipts before closure.

## Recovery and limits

Revert only the SEO application commit if live smoke checks fail. The CMS inverse is reinserting the removed link object at `{blocks,3,links,4}`, guarded by the exact post-correction content hash; do not overwrite a newer editorial revision. The removed item is `{ "url": "/blog/remove-kitchen-grease-without-damaging-surfaces", "label": "How to remove tough kitchen grease safely" }`.

Search Console indexing requests, content rewrites and broader SEO recommendations remain separate follow-up stages. This package establishes local implementation evidence only. Independent QA, staging verification, production release and closure are NOT ASSESSED / pending.
