# Blog routing & editorial SEO governance

This document describes how Shalean enforces **canonical-first** `/blog/*` URLs, redirect cleanup, CI checks, and safe linking from CMS content.

## Canonical slug policy

- **Single source of truth** for redirect rules: `apps/web/lib/seo/programmaticBlogCleanupRedirects.ts`, mirrored in `BLOG_REDIRECT_SOURCE_TO_DEST` inside `apps/web/lib/blog/validBlogRoutes.ts`.
- **Never link** to paths whose slug is in `REDIRECT_ALIAS_BLOG_SLUGS` — these are **redirect-only** sources. Always use the resolved canonical target (or the commercial URL when the destination leaves `/blog/*`).
- **Normalization** for internal links: `normalizeBlogHref(href)` resolves redirect chains for `/blog/*`, preserves query/hash, and treats `mailto:` / `tel:` / fragment-only (`#faqs`) hrefs safely.

## Redirect policy

- Redirects exist to collapse legacy programmatic clones, deprecated editorial slugs, and thin stubs onto **one canonical URL** per intent.
- **Sitemap** excludes redirect aliases (`getCanonicalBlogSlug`, `isRedirectAliasBlogSlug`, `shouldExcludeBlogSlugFromSitemap`).
- **Build validation**: `npm run validate:blog-routes` checks duplicate sources, cycles, and that redirect terminals are defined in-repo (programmatic pools, HC, Airbnb guides, or structured hub seeds).

## Route ownership (`getBlogRouteOwnership`)

Classifies **sync** knowledge about a slug (DB-only posts appear as `DATABASE_DYNAMIC`):

| Value | Meaning |
| --- | --- |
| `REDIRECT_ALIAS` | Slug is only a redirect **source** |
| `STATIC_EDITORIAL` | Canonical editorial constants (`canonicalEditorialBlogLinks`) |
| `HC_EDITORIAL` | High-conversion in-repo articles |
| `AIRBNB_PROGRAMMATIC` | Airbnb host guide pool |
| `LOCATION_PROGRAMMATIC` | Programmatic location/service blog pool |
| `DATABASE_DYNAMIC` | Not in static pools (typically CMS-published) |

Used for audits, debugging, and the governance report — not for authorization.

## Safe linking in React

- Use **`SafeInternalLink`** (`apps/web/components/links/SafeInternalLink.tsx`) instead of raw `next/link` for **internal** URLs that may include `/blog/*` paths so redirects are normalized consistently with `next.config` / middleware.
- **Dev warnings**: `warnIfLikelyBrokenBlogHrefDev` logs when a `/blog/{slug}` is outside `DEV_BLOG_STATIC_LINK_ALLOWLIST` (CMS may still serve — warning only).

## CMS & rich text sanitation

Server-safe helpers (`apps/web/lib/blog/editorialSanitize.ts`):

- `sanitizeEditorialHref(href)` — `normalizeBlogHref` + observability hooks when `EDITORIAL_LINK_OBSERVABILITY=1`.
- `sanitizeEditorialHtml(html)` — rewrite `href="..."` in sanitized HTML blobs.
- `sanitizeEditorialMarkdown(md)` — rewrite `[text](url)` targets.

**Blog rendering**: `BlogContentRenderer` runs `sanitizeEditorialHtml` after `sanitizeBlogRichHtml`, and `sanitizeEditorialMarkdown` on paragraph / auto-link paths.

## Forbidden patterns

- Hardcoding **redirect alias** paths in TSX, seeds, or markdown (CI: `npm run audit:internal-links` fails).
- Emitting **different** canonical URLs in JSON-LD vs `<link rel="canonical">` vs internal links for the same article (catch with live validator).
- Adding **duplicate slug ownership** across HC, programmatic, and Airbnb pools (`validate-blog-routes` fails).

## Sitemap governance

- Implemented in `apps/web/app/sitemap.ts`: canonical blog slugs only; aliases skipped.
- Tag/category archives are intentionally omitted where policy marks them non-indexable.

## Redirect lifecycle

1. Add cleanup rule in `programmaticBlogCleanupRedirects` (source → destination).
2. Ensure destination exists (CMS publish or in-repo pool per `validate-blog-routes`).
3. Replace internal links and seeds to point **directly** at the canonical URL.
4. Run `npm run validate:blog-routes`, `npm run audit:internal-links`, and (against prod/staging) `npm run validate:live-seo`.

## CI & scripts

| Script | Purpose |
| --- | --- |
| `npm run validate:blog-routes` | Redirect graph + slug collision checks |
| `npm run audit:internal-links` | Repo scan for `/blog/*` alias usage |
| `npm run validate:live-seo` | Requires `AUDIT_BASE_URL` — sitemap URLs must return 200 without redirect; canonical must match |
| `npm run report:blog-seo-governance` | Static ownership / pool snapshot |

## Observability

- Set `EDITORIAL_LINK_OBSERVABILITY=1` to increment counters for normalized hrefs / alias inputs (`editorialLinkObservability.ts`). Default: **off** (no production noise).

## Examples

**Correct**

```tsx
<SafeInternalLink href="/blog/deep-vs-standard-cleaning-cape-town">Compare tiers</SafeInternalLink>
```

(Resolves at render to the canonical slug per redirect map.)

**Incorrect**

```tsx
<Link href="/blog/deep-vs-standard-cleaning-cape-town">…</Link>
```

(Bypasses shared normalization — avoid for `/blog/*`.)

**Correct CMS blob**

```html
<a href="/blog/move-out-cleaning-checklist-cape-town">Handover checklist</a>
```

(run through `sanitizeEditorialHtml` when rendering.)

## Related files

- `validBlogRoutes.ts` — registry, `normalizeBlogHref`, `getCanonicalBlogSlug`, ownership.
- `SafeInternalLink.tsx` — client navigation wrapper.
- `editorialSanitize.ts` — HTML/markdown href rewriting.
- `scripts/validate-live-seo.ts` — production crawl checks.
