# SEO-LIVE-LINKS-01 — broken article links

Status: application fix merged to main and verified on live staging. Production release and the CMS forward migration are pending final review.
Authority: Farai's 20 October 2026 instruction to proceed carefully with the live SEO assessment, following the existing staged audit process.

## Exact scope

| Broken destination | Repair |
| --- | --- |
| `/services/carpet-cleaning` | Render article links directly to `/services/carpet-cleaning-cape-town`; recover old requests with an exact 308 redirect. |
| `/services/move-out-cleaning` | Render article links directly to `/services/move-out-cleaning-cape-town`; recover old requests with an exact 308 redirect. |
| `/services/window-cleaning` | Render article links directly to `/services/window-cleaning-cape-town`; recover old requests with an exact 308 redirect. |
| `/blog/remove-kitchen-grease-without-damaging-surfaces` | Remove the single Helpful Shalean guides item pointing to this draft from the published cleaning-mistakes article. Do not publish or redirect the draft. |

The application fix extends the existing exact marketing redirect matrix and shared editorial href normalizer. Matching preserves query strings and fragments. Existing canonical destinations, unrelated child paths, external hosts and booking/account/API paths have regression coverage.

The CMS correction is the CLI-generated forward migration `supabase/migrations/20261020123743_seo_remove_unpublished_article_link.sql`. It resolves articles by unique slug, locks the source and draft destination, checks the exact reviewed content hash and link position, and changes only one `content_json` element. It fails closed on revised/null content, an unpublished source, or a destination no longer in draft. It safely skips absent editorial content in fresh/staging databases and an exact already-corrected source. No draft is published. The earlier standalone SQL rehearsal is removed.

## Baseline and evidence

- Repository main and live staging: `573cc0d707cae1ab6dd0dc0ee138babf19a40499`.
- Production branch and live production: `3386c6e5f6d5737ec0814963f5c8c9f8e1c5afd3`.
- Live short service destinations returned 404; corresponding Cape Town canonical destinations returned 200.
- SiteGuru reported four broken destinations across seven articles. Direct HTTP inspection confirmed the affected service anchors in the carpet-frequency and window-cost articles.
- Production CMS read confirmed that `cleaning-mistakes-cape-town-homeowners` is published and its helpful links include the unpublished kitchen-grease draft. Source content hash: `67c205926d0be799d7d31e92d888005f`.
- Staging has the blog table but no matching CMS source/draft rows. No ad-hoc staging rows were inserted.
- No live CMS mutation has been executed at this review checkpoint.

## Validation completed

- Four focused test files: 36 tests passed, including HTML and Markdown links, absolute internal URLs, query/hash preservation, canonical paths, external links, unrelated child paths, booking/account/API paths and sitemap rules.
- Critical suite: 128 files / 1,486 tests passed.
- TypeScript check passed.
- Booking-core ESLint gate passed with zero errors and four existing warnings.
- Blog route governance and static internal-link audit passed. The scripts were executed with `node --import tsx` because the `tsx` CLI's IPC socket is unavailable in this environment; script content and assertions were unchanged.
- Exact public CMS JSON tested in isolated PGlite 0.5.10: rollback preserves all rows; simulated apply removes exactly one link and preserves article text/metadata/other links/other rows; stale content fails closed; a newly published destination fails closed.
- Isolated post-correction hash: `bde0cf46162b57b84b221cd066e29f52`; helpful links change from 9 to 8.
- Forward-migration isolated regression covers atomic rollback of article and ledger, exact single-link correction with the real timestamp trigger, identical receipt replay, data-level idempotency, guarded inverse restoration, absent staging content, stale/null content, unpublished source, published/missing destination and conflicting receipt. The fixture contains only the public source article content. CI runs the same PGlite test.
- `npm run db:migrations:validate` and `git diff --check` passed.

## Release evidence and remaining gates

- Farai explicitly approved publishing this bounded correction to the public `shalean-developer/shalean-platform` repository on 20 October 2026 after the initial automatic approval rejection.
- Application PR #985 passed final-head CI and independent review, then merged as `569a03774f55eeba995c8df464d4e4bc591ea0e9`. Push web-test run 39420791775 and staging bundle run 39420791700 succeeded.
- Plesk automatically activated staging SHA `569a03774f55eeba995c8df464d4e4bc591ea0e9`; deployment result PASS. Ten live HTTP checks passed: exact SHA, three exact 308 aliases preserving query strings, three canonical 200 destinations, and three representative booking routes. Canonical staging remains on `deploy/staging`; isolated PR previews must not replace it.
- Production PR #986 starts from production `3386c6e5f6d5737ec0814963f5c8c9f8e1c5afd3` and contains only this SEO package. It excludes unrelated pending main work. Its first review identified the standalone-data-correction governance issue; this forward migration, receipt path and regression test address that finding before production release.

1. Pass final-head CI and independent review for the forward-migration follow-up on main and the bounded production PR.
2. Record the exact reviewed forward migration on staging, where absent source content makes it a no-op. Recheck the staging ledger receipt. Public-table fixtures are not inserted into shared staging.
3. Merge the bounded production PR through the existing automatic deployment path. Verify the exact live production SHA and the three redirects/canonical destinations/representative booking routes.
4. Re-read the production source hash and destination draft status, rehearse the exact tracked application with ROLLBACK, then apply the same reviewed bytes and verify their migration receipt.
5. Reconcile all seven affected live articles, all four old broken destinations, metadata, headings and booking-link counts. Record actual receipts before closure.

## Controlled data-migration application

`node scripts/audits/seo-cms-migration-apply.mjs` emits the exact forward migration in a single bounded transaction with 5-second lock and 15-second statement timeouts. It has no network or credential access. The authorized operator executes that output through the connected project's SQL interface only after review and environment gates. For a rehearsal, replace the final COMMIT with ROLLBACK without changing the migration body.

This is a data-only application: the migration's article edit and a new `supabase_migrations.schema_migrations` receipt for version `20261020123743` commit atomically. The receipt stores the exact file bytes as `statements` and the filename name. A matching receipt makes reapplication a no-op; a conflicting receipt fails closed. An advisory lock serializes this version. No historical migration row is inserted, updated, repaired or deleted, and no other pending migration is applied. This explicit path preserves the authored CLI version; an API-generated alternate timestamp must not create ledger drift. Schema changes remain subject to the normal DDL migration tooling.

## Recovery and limits

Revert only the SEO application commit if live smoke checks fail. The CMS inverse is reinserting the removed link object at `{blocks,3,links,4}`, guarded by the exact post-correction content hash; do not overwrite a newer editorial revision. The removed item is `{ "url": "/blog/remove-kitchen-grease-without-damaging-surfaces", "label": "How to remove tough kitchen grease safely" }`.

Search Console indexing requests, content rewrites and broader SEO recommendations remain separate follow-up stages. Production migration and deployment receipts are pending; staging application verification is complete as recorded above.
