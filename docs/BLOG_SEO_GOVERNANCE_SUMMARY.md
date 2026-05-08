# Blog / editorial SEO governance summary

Enterprise-grade editorial SEO builds on **canonical routing**, **static validation**, **live audits**, and **ingestion guards**. This document captures the Phase 3 milestone: canonical pools, purity scoring, observability hooks, CMS validation helpers, graph exports, extended live checks, and CI wiring.

## Architecture overview

| Layer | Role |
| --- | --- |
| `lib/blog/validBlogRoutes.ts` | Authoritative registry: redirect resolution, `normalizeBlogHref`, ownership (`getBlogRouteOwnership`), static allowlist |
| `lib/seo/programmaticBlogCleanupRedirects.ts` | Single source of truth for legacy `/blog/*` → canonical redirects |
| `SafeInternalLink` + `normalizeBlogHref` | Runtime navigation always resolves cleanup chains |
| `sanitizeEditorialHtml` / `sanitizeEditorialMarkdown` | CMS HTML / markdown href rewriting |
| `validate-editorial-content-links` (`validateEditorialContentLinks`) | Pre-publish validation + optional auto-fix |
| Scripts | `validate-blog-routes`, `audit-internal-links`, `validate-live-seo`, `calculate-canonical-purity`, `export-blog-route-graph`, `blog-seo-governance-report` |

## Ownership distribution (static pool)

Run `npm run report:blog-seo-governance` for live counts. After Phase 3 programmatic canonicalization:

- **`REDIRECT_ALIAS` inside `DEV_BLOG_STATIC_LINK_ALLOWLIST` targets ~0** — thin programmatic rows collapse onto canonical `/blog/cleaning-services-*` hubs; redirect-only slugs remain **only** in redirect maps.
- CMS-only URLs continue to resolve at runtime as **`DATABASE_DYNAMIC`** when absent from static pools.

## Canonical purity

Run:

```bash
npm run report:canonical-purity
```

The scanner walks `apps/web` sources (excluding `programmaticBlogCleanupRedirects.ts`, matching `audit-internal-links`) and reports:

- Total `/blog/*` path literals vs strict canonical matches (`normalizeBlogHref` equality)
- Redirect-alias occurrences in **application** sources (should stay **0**)
- **`redirectHopReliancePercent`** — reliance on normalization (target **0** in shipped TSX)
- **`internalBlogLinksOutsideStaticAllowlist`** — informational (CMS-backed slugs linked from code)

Optional JSON: `CANONICAL_PURITY_JSON=./out/purity.json npm run report:canonical-purity`

**Latest smoke snapshot (local):** canonical purity **100%**, redirect-hop reliance **0%**, internal link audit alias hits **0**.

## Redirect dependency

All legacy sources remain enumerated in `programmaticBlogCleanupRedirects.ts` for middleware / Next config parity. Governance reports expose:

- `REDIRECT_ALIAS_BLOG_SLUGS` count (inventory)
- `REDIRECT_DESTINATION_BLOG_SLUGS` (canonical blog terminals referenced by rules)

Graph export:

```bash
npm run export:blog-route-graph
BLOG_ROUTE_GRAPH_JSON=out/graph.json BLOG_ROUTE_GRAPH_MERMAID=out/graph.mmd npm run export:blog-route-graph
```

## Sitemap health

- `shouldExcludeBlogSlugFromSitemap` keeps redirect sources and thin clones out of `sitemap.xml`.
- `validate-blog-routes` asserts redirect chains terminate on defined blog terminals or commercial URLs.

## Crawl integrity & prioritization

Operational recommendations (implementation is incremental):

1. Prefer **one hub URL per suburb cluster** (`cleaning-services-{area}-cape-town`) for overlapping service intents.
2. Keep **contextual** links primary; trim duplicate sidebar loops where hubs already consolidate authority.
3. Use **`getHubEditorialGuideLinks`** / **`getEditorialClusterBlogLinksForHub`** — now hub-aware after canonical programmatic collapse.
4. Run **`npm run audit:internal-links`** and **`npm run report:canonical-purity`** on PRs touching `/blog` or SEO modules.

## Production observability

Opt-in counters (disabled by default; **no PII**):

- `EDITORIAL_LINK_OBSERVABILITY=1` **or** `SEO_ROUTE_TELEMETRY=1`

Snapshot API: `getBlogRouteTelemetrySnapshot()` → `{ canonicalRewrites, invalidInternalLinks, rejectedAliases, orphanReferences }` (see `lib/blog/editorialLinkObservability.ts`).

Wire periodic snapshots from admin / logging pipelines as needed.

## Editorial ingestion

- **`validateEditorialContentLinks({ html, markdown, tiptapJson })`** — flags redirect aliases and non-canonical blog paths; optional `autoFixLegacySlugs`.
- **`getEditorialLinkDiagnostics`** — lightweight rows (`severity`, `code`, `suggestedCanonical`) for editor/admin panels.
- **`strictStaticAllowlist`** — optional noise for CMS-only slugs.

## Live SEO validation

`npm run validate:live-seo` (requires `AUDIT_BASE_URL`):

- Baseline: sitemap 200, no redirects on listed URLs, canonical matches fetched URL.
- **Extended** (`LIVE_SEO_EXTENDED=1`): `robots` **noindex** conflicts vs sitemap listings; `og:url` alignment vs canonical.

Set `LIVE_SEO_EXTENDED` as a GitHub Actions **variable** when enabling stricter checks.

## CI enforcement

`.github/workflows/web-test.yml` runs:

- `validate:blog-routes`
- `audit:internal-links` (fails on redirect-alias hits in code)
- `report:blog-seo-governance`
- `report:canonical-purity`
- Optional `validate:live-seo` when `AUDIT_BASE_URL` is configured

## Seed / import hygiene

`lib/blog/seed/seoTrafficBlogPosts.ts` **canonical blog slugs** replaced legacy redirect-only titles:

| Legacy redirect source slug | New canonical seed slug |
| --- | --- |
| `cleaning-prices-cape-town-guide` | `pricing-guide-house-cleaning-cape-town` |
| `airbnb-cleaning-vs-regular-home-cleaning-cape-town` | `airbnb-host-vs-regular-cleaning-cape-town` |
| `move-out-cleaning-checklist-cape-town-renters` | `move-out-cleaning-checklist-tenants-cape-town` |

301 rules in `programmaticBlogCleanupRedirects.ts` **unchanged** so old URLs keep working.

## Remaining risks

1. **CMS drift** — DB-published posts can still introduce legacy hrefs; mitigate with `sanitizeEditorialHtml` on save + `validateEditorialContentLinks` in admin.
2. **Programmatic merge semantics** — collapsed hub rows pick a single “winner” `ProgrammaticPost` metadata row per slug; monitor titles/keywords if templates read stale fields.
3. **Live SEO extended checks** — `og:url` / `robots` patterns may need tuning for edge templates; gate with `LIVE_SEO_EXTENDED`.

## Future scaling

- Stream **`getBlogRouteTelemetrySnapshot`** to Datadog / OTEL (gauge counters).
- Deep JSON-LD canonical parity (BlogPosting `@id`) behind a dedicated flag once templates stabilize.
- **`hreflang`** validation when multi-locale ships.
- Graph clustering dashboards from `export-blog-route-graph` outputs.
