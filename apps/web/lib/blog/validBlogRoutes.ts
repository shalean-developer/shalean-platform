/**
 * Authoritative blog route registry & canonicalization (sync, no I/O).
 * Single place for: static slug pools, redirect chains, href normalization, dev warnings.
 *
 * Env note: `NEXT_PUBLIC_LEGACY_HIGH_CONVERSION_ROUTES=false` and `NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES=false`
 * shrink **routed** in-repo pools — redirects must still terminate on CMS-backed slugs or commercial URLs.
 * Build validation (`scripts/validate-blog-routes.ts`) ensures cleanup redirect destinations exist as code or hub seeds.
 *
 * DB-published slugs are intentionally open-ended — use {@link isRedirectAliasBlogSlug} to reject
 * legacy paths that must never be linked directly; use {@link isStaticCodeOwnedBlogSlug} when you
 * need to know if `/blog/{slug}` is served without Supabase.
 */

import {
  CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF,
  CANONICAL_BEST_AIRBNB_TIPS_CAPE_TOWN_HREF,
  CANONICAL_DEEP_VS_STANDARD_BLOG_HREF,
  CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF,
} from "@/lib/blog/canonicalEditorialBlogLinks";
import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import {
  HIGH_CONVERSION_POSTS,
  ROUTED_HIGH_CONVERSION_POSTS,
} from "@/lib/blog/highConversionPosts";
import { PROGRAMMATIC_POSTS, ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { LOCATION_HUB_SEO_IMAGE_SLUGS } from "@/lib/blog/injectLocationHubSeoImages";
import { programmaticBlogCleanupRedirects } from "@/lib/seo/programmaticBlogCleanupRedirects";

/** Normalize pathname: trim trailing slashes except root. */
export function normalizeBlogPathname(path: string): string {
  const p = path.trim().split(/[?#]/)[0] ?? "";
  if (!p || p === "/") return "/";
  return p.replace(/\/+$/, "") || "/";
}

/** `/blog/foo` → `foo`, else null */
export function blogSlugFromPathname(path: string): string | null {
  const n = normalizeBlogPathname(path);
  if (!n.startsWith("/blog/")) return null;
  const slug = n.slice("/blog/".length);
  return slug.length > 0 ? slug : null;
}

/** Single-hop + chain: `/blog/*` sources from {@link programmaticBlogCleanupRedirects}. */
export const BLOG_REDIRECT_SOURCE_TO_DEST: ReadonlyMap<string, string> = new Map(
  programmaticBlogCleanupRedirects.map((r) => {
    const src = normalizeBlogPathname(r.source);
    const rawDest = r.destination.split(/[?#]/)[0] ?? r.destination;
    const dest = rawDest.startsWith("/") ? normalizeBlogPathname(rawDest) : rawDest;
    return [src, dest] as const;
  }),
);

/**
 * Follow internal redirect entries until a fixed point (or cycle / max hops).
 * Non-`/blog` destinations stop the walk — callers compare final path.
 */
export function resolveBlogRedirectChain(path: string, maxHops = 16): string {
  let current = normalizeBlogPathname(path.split(/[?#]/)[0] ?? path);
  const visited = new Set<string>();
  for (let i = 0; i < maxHops; i++) {
    if (visited.has(current)) return current;
    visited.add(current);
    const next = BLOG_REDIRECT_SOURCE_TO_DEST.get(current);
    if (!next) return current;
    const nextPath = normalizeBlogPathname(next.split(/[?#]/)[0] ?? next);
    current = nextPath;
  }
  return current;
}

/** Slugs that are only redirect sources — never use in internal links or sitemap. */
export const REDIRECT_ALIAS_BLOG_SLUGS: ReadonlySet<string> = new Set(
  programmaticBlogCleanupRedirects
    .map((r) => blogSlugFromPathname(r.source))
    .filter((s): s is string => Boolean(s)),
);

/** `/blog/*` destinations appearing in cleanup redirects (canonical targets for those rules). */
export const REDIRECT_DESTINATION_BLOG_SLUGS: ReadonlySet<string> = new Set(
  programmaticBlogCleanupRedirects
    .map((r) => blogSlugFromPathname(r.destination))
    .filter((s): s is string => Boolean(s)),
);

const CANONICAL_EDITORIAL_SLUGS: string[] = [
  blogSlugFromPathname(CANONICAL_DEEP_VS_STANDARD_BLOG_HREF),
  blogSlugFromPathname(CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF),
  blogSlugFromPathname(CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF),
  blogSlugFromPathname(CANONICAL_BEST_AIRBNB_TIPS_CAPE_TOWN_HREF),
].filter((s): s is string => Boolean(s));

const STATIC_EDITORIAL_SLUG_SET = new Set(CANONICAL_EDITORIAL_SLUGS.map((s) => s.toLowerCase()));
const HC_SLUG_SET = new Set(HIGH_CONVERSION_POSTS.map((p) => p.slug.toLowerCase()));
const PROGRAMMATIC_SLUG_SET = new Set(PROGRAMMATIC_POSTS.map((p) => p.slug.toLowerCase()));
const AIRBNB_GUIDE_SLUG_SET = new Set(AIRBNB_HOST_GUIDE_POSTS.map((p) => p.slug.toLowerCase()));

/** Explicit route ownership for audits, sitemap logic, and debugging (sync; DB-only slugs → DATABASE_DYNAMIC). */
export type BlogRouteOwnership =
  | "REDIRECT_ALIAS"
  | "STATIC_EDITORIAL"
  | "HC_EDITORIAL"
  | "AIRBNB_PROGRAMMATIC"
  | "LOCATION_PROGRAMMATIC"
  | "DATABASE_DYNAMIC";

export function getBlogRouteOwnership(slug: string): BlogRouteOwnership {
  const s = slug.trim().toLowerCase();
  if (!s) return "DATABASE_DYNAMIC";
  if (REDIRECT_ALIAS_BLOG_SLUGS.has(s)) return "REDIRECT_ALIAS";
  if (STATIC_EDITORIAL_SLUG_SET.has(s)) return "STATIC_EDITORIAL";
  if (AIRBNB_GUIDE_SLUG_SET.has(s)) return "AIRBNB_PROGRAMMATIC";
  if (PROGRAMMATIC_SLUG_SET.has(s)) return "LOCATION_PROGRAMMATIC";
  if (HC_SLUG_SET.has(s)) return "HC_EDITORIAL";
  return "DATABASE_DYNAMIC";
}

/** Slugs served from in-repo templates today (respects legacy env flags on routed pools). */
export function collectStaticCodeOwnedBlogSlugs(): Set<string> {
  return new Set([
    ...ROUTED_PROGRAMMATIC_POSTS.map((p) => p.slug),
    ...AIRBNB_HOST_GUIDE_POSTS.map((p) => p.slug),
    ...ROUTED_HIGH_CONVERSION_POSTS.map((p) => p.slug),
  ]);
}

export const STATIC_CODE_OWNED_BLOG_SLUGS: ReadonlySet<string> = collectStaticCodeOwnedBlogSlugs();

/**
 * Dev/build allowlist: code-defined posts + redirect canonical blog targets + editorial constants.
 * CMS-only URLs may still 200 — absent here does not imply 404.
 */
export function collectDevBlogStaticLinkAllowlist(): Set<string> {
  const set = new Set<string>();
  for (const p of PROGRAMMATIC_POSTS) set.add(p.slug);
  for (const p of HIGH_CONVERSION_POSTS) set.add(p.slug);
  for (const p of AIRBNB_HOST_GUIDE_POSTS) set.add(p.slug);
  for (const s of REDIRECT_DESTINATION_BLOG_SLUGS) set.add(s);
  for (const s of CANONICAL_EDITORIAL_SLUGS) set.add(s);
  for (const s of LOCATION_HUB_SEO_IMAGE_SLUGS) set.add(s);
  return set;
}

export const DEV_BLOG_STATIC_LINK_ALLOWLIST: ReadonlySet<string> = collectDevBlogStaticLinkAllowlist();

export function isRedirectAliasBlogSlug(slug: string): boolean {
  return REDIRECT_ALIAS_BLOG_SLUGS.has(slug.trim().toLowerCase());
}

export function isStaticCodeOwnedBlogSlug(slug: string): boolean {
  return STATIC_CODE_OWNED_BLOG_SLUGS.has(slug.trim().toLowerCase());
}

/** Apply cleanup redirects to a slug (identity if already canonical). */
export function getCanonicalBlogSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!s) return s;
  const path = `/blog/${s}`;
  const resolved = resolveBlogRedirectChain(path);
  return blogSlugFromPathname(resolved) ?? s;
}

/** `/blog/{canonicalSlug}` after redirect resolution. */
export function getCanonicalBlogRoute(slug: string): string {
  const canon = getCanonicalBlogSlug(slug);
  return `/blog/${canon}`;
}

/**
 * Valid direct blog slug for linking: not a legacy redirect-only alias.
 * CMS-backed posts may still exist for slugs not in the static allowlist.
 */
export function isValidBlogRoute(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s) return false;
  return !REDIRECT_ALIAS_BLOG_SLUGS.has(s);
}

/**
 * Normalize internal blog hrefs: resolve redirect chains, preserve query/hash.
 * Absolute URLs on shalean hosts are normalized to path form for matching (still returns path+suffix).
 */
export function normalizeBlogHref(href: string): string {
  const raw = href.trim();
  if (!raw) return raw;
  if (/^(mailto:|tel:)/i.test(raw)) return raw;

  let pathname = "";
  let suffix = "";

  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      pathname = u.pathname;
      suffix = u.search + u.hash;
      const host = u.hostname.replace(/^www\./, "");
      if (host !== "shalean.co.za" && host !== "localhost" && !host.startsWith("127.0.0.1")) {
        return href;
      }
    } else {
      if (raw.startsWith("#")) return raw;
      const q = raw.indexOf("?");
      const h = raw.indexOf("#");
      let cut = raw.length;
      if (q !== -1) cut = Math.min(cut, q);
      if (h !== -1) cut = Math.min(cut, h);
      pathname = raw.slice(0, cut);
      suffix = raw.slice(cut);
      if (pathname === "") {
        return suffix || "/";
      }
      if (!pathname.startsWith("/")) pathname = `/${pathname}`;
    }
  } catch {
    return href;
  }

  const np = normalizeBlogPathname(pathname);
  const finalPath = np.startsWith("/blog") ? resolveBlogRedirectChain(np) : np;
  return `${finalPath}${suffix}`;
}
