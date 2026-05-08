/**
 * Prints a static governance snapshot (no HTTP): route ownership distribution,
 * redirect-alias inventory size, static link pool size.
 *
 * `npm run report:blog-seo-governance`
 */

import {
  DEV_BLOG_STATIC_LINK_ALLOWLIST,
  REDIRECT_ALIAS_BLOG_SLUGS,
  REDIRECT_DESTINATION_BLOG_SLUGS,
  getBlogRouteOwnership,
  type BlogRouteOwnership,
} from "../lib/blog/validBlogRoutes";

function main(): void {
  const buckets = new Map<BlogRouteOwnership, number>();
  for (const slug of DEV_BLOG_STATIC_LINK_ALLOWLIST) {
    const o = getBlogRouteOwnership(slug);
    buckets.set(o, (buckets.get(o) ?? 0) + 1);
  }

  console.log("=== Blog / editorial SEO governance report (static) ===\n");
  console.log(`DEV_BLOG_STATIC_LINK_ALLOWLIST entries: ${DEV_BLOG_STATIC_LINK_ALLOWLIST.size}`);
  console.log(`REDIRECT_ALIAS_BLOG_SLUGS (never link directly): ${REDIRECT_ALIAS_BLOG_SLUGS.size}`);
  console.log(`REDIRECT_DESTINATION_BLOG_SLUGS (canonical targets in cleanup rules): ${REDIRECT_DESTINATION_BLOG_SLUGS.size}`);
  console.log("\nOwnership distribution (static pool only — CMS slugs are DATABASE_DYNAMIC at runtime):\n");
  const order: BlogRouteOwnership[] = [
    "STATIC_EDITORIAL",
    "HC_EDITORIAL",
    "AIRBNB_PROGRAMMATIC",
    "LOCATION_PROGRAMMATIC",
    "DATABASE_DYNAMIC",
    "REDIRECT_ALIAS",
  ];
  for (const k of order) {
    console.log(`  ${k}: ${buckets.get(k) ?? 0}`);
  }
  console.log("\nNotes:");
  console.log("  • Canonical-only navigation: use SafeInternalLink + normalizeBlogHref.");
  console.log("  • CMS HTML/markdown: sanitizeEditorialHtml / sanitizeEditorialMarkdown.");
  console.log("  • CI: npm run validate:blog-routes && npm run audit:internal-links");
  console.log("  • Purity: npm run report:canonical-purity");
  console.log("  • Graph: npm run export:blog-route-graph");
  console.log("  • Production: AUDIT_BASE_URL=https://… npm run validate:live-seo (optional LIVE_SEO_EXTENDED=1)");
}

main();
