/**
 * Build-time blog route governance: redirect chains, duplicate ownership, invalid `/blog/*` terminals.
 * Run via `npm run build` (prepended) or `npx tsx scripts/validate-blog-routes.ts`.
 */

import { AIRBNB_HOST_GUIDE_POSTS } from "../lib/blog/airbnbHostGuidePosts";
import { HIGH_CONVERSION_POSTS } from "../lib/blog/highConversionPosts";
import { PROGRAMMATIC_POSTS } from "../lib/blog/programmaticPosts";
import {
  BLOG_REDIRECT_SOURCE_TO_DEST,
  blogSlugFromPathname,
  normalizeBlogPathname,
  resolveBlogRedirectChain,
} from "../lib/blog/validBlogRoutes";
import { LOCATION_HUB_STRUCTURED_PAGES } from "../lib/blog/seed/locationHubStructuredContent";
import { programmaticBlogCleanupRedirects } from "../lib/seo/programmaticBlogCleanupRedirects";
import { CAPE_TOWN_LOCATIONS } from "../lib/seo/capeTownLocations";
import { CAPE_TOWN_SERVICE_SEO } from "../lib/seo/capeTownSeoPages";

const DEFINED_SLUGS = new Set<string>([
  ...PROGRAMMATIC_POSTS.map((p) => p.slug),
  ...AIRBNB_HOST_GUIDE_POSTS.map((p) => p.slug),
  ...HIGH_CONVERSION_POSTS.map((p) => p.slug),
  ...LOCATION_HUB_STRUCTURED_PAGES.map((h) => h.slug),
]);

const ALLOWED_LOCATION_PATHS = new Set(CAPE_TOWN_LOCATIONS.map((l) => `/locations/${l.slug}`));
const ALLOWED_SERVICE_PATHS = new Set(Object.values(CAPE_TOWN_SERVICE_SEO).map((b) => b.path));
const ALLOWED_STATIC_COMMERCIAL_PATHS = new Set<string>(["/cleaning-prices-cape-town"]);

function assertBlogTerminalOk(path: string, ctx: string): void {
  const n = normalizeBlogPathname(path);
  if (!n.startsWith("/blog/")) return;
  const slug = blogSlugFromPathname(n);
  if (!slug) throw new Error(`${ctx}: empty blog slug`);
  if (!DEFINED_SLUGS.has(slug)) {
    throw new Error(
      `${ctx}: redirect terminal /blog/${slug} has no in-repo article definition — publish in CMS with this slug or add to PROGRAMMATIC/AIRBNB/HC pools.`,
    );
  }
}

function assertRedirectTerminalOk(finalPath: string, ctx: string): void {
  const n = normalizeBlogPathname(finalPath.split(/[?#]/)[0] ?? finalPath);
  if (n.startsWith("/blog/")) {
    assertBlogTerminalOk(n, ctx);
    return;
  }
  if (ALLOWED_LOCATION_PATHS.has(n)) return;
  if (ALLOWED_SERVICE_PATHS.has(n)) return;
  if (ALLOWED_STATIC_COMMERCIAL_PATHS.has(n)) return;
  throw new Error(
    `${ctx}: redirect terminal ${n} is not a validated /locations hub, Cape Town service path, or pricing hub`,
  );
}

function main(): void {
  const errors: string[] = [];

  /** Duplicate redirect sources */
  const sources = programmaticBlogCleanupRedirects.map((r) => normalizeBlogPathname(r.source));
  const seenSrc = new Map<string, number>();
  for (const s of sources) {
    seenSrc.set(s, (seenSrc.get(s) ?? 0) + 1);
  }
  for (const [s, n] of seenSrc) {
    if (n > 1) errors.push(`Duplicate redirect source: ${s} (${n} entries)`);
  }

  /** Static slug collisions across pools (runtime also throws for HC∩PROGRAMMATIC) */
  const hc = new Set(HIGH_CONVERSION_POSTS.map((p) => p.slug));
  for (const p of PROGRAMMATIC_POSTS) {
    if (hc.has(p.slug)) errors.push(`Slug collision HC ∩ programmatic: ${p.slug}`);
  }
  for (const p of AIRBNB_HOST_GUIDE_POSTS) {
    if (hc.has(p.slug)) errors.push(`Slug collision HC ∩ airbnb guide: ${p.slug}`);
    const prog = PROGRAMMATIC_POSTS.find((x) => x.slug === p.slug);
    if (prog) errors.push(`Slug collision programmatic ∩ airbnb guide: ${p.slug}`);
  }

  /** Chains, cycles, terminals */
  for (const r of programmaticBlogCleanupRedirects) {
    const src = normalizeBlogPathname(r.source);
    const visited = new Set<string>();
    let cur = src;
    for (let hop = 0; hop < 24; hop++) {
      if (visited.has(cur)) {
        errors.push(`Redirect cycle involving ${src}`);
        break;
      }
      visited.add(cur);
      const next = BLOG_REDIRECT_SOURCE_TO_DEST.get(cur);
      if (!next) break;
      const nextPath = normalizeBlogPathname(next.split(/[?#]/)[0] ?? next);
      cur = nextPath;
    }

    const finalPath = resolveBlogRedirectChain(src);
    try {
      assertRedirectTerminalOk(finalPath, `Rule ${src}→…`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (errors.length) {
    console.error("[validate-blog-routes] FAILED:\n", errors.join("\n"));
    process.exit(1);
  }
  console.log("[validate-blog-routes] OK");
}

main();
