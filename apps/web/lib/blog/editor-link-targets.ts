import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";
import { legacyMarketingRedirectSourcePaths } from "@/lib/seo/legacyMarketingRedirectMatrix";
import { isSeoRebuildGonePath } from "@/lib/seo/seoRebuildPhase1";
import { STATIC_CODE_OWNED_BLOG_SLUGS, isRedirectAliasBlogSlug } from "@/lib/blog/validBlogRoutes";

export type EditorLinkTarget = { url: string; label: string; kind: "Service" | "Location" | "Blog" | "Page" };

export function buildEditorLinkTargets(publishedPosts: { slug: string; title: string }[]): EditorLinkTarget[] {
  const targets: EditorLinkTarget[] = [
    { url: "/services", label: "View all cleaning services", kind: "Page" },
    { url: "/locations", label: "View all cleaning areas", kind: "Page" },
    { url: "/blog", label: "Cleaning advice and guides", kind: "Page" },
    { url: "/book", label: "Book a cleaner online", kind: "Page" },
    { url: "/contact", label: "Contact Shalean", kind: "Page" },
    ...Object.values(CAPE_TOWN_SERVICE_SEO).map(page => ({ url: page.path, label: page.title.split("|")[0].trim(), kind: "Service" as const })),
    ...Object.values(LOCATION_SEO_PAGES).map(page => ({ url: page.path, label: page.h1, kind: "Location" as const })),
    ...publishedPosts.filter(post => !isRedirectAliasBlogSlug(post.slug)).map(post => ({ url: `/blog/${post.slug}`, label: post.title, kind: "Blog" as const })),
    ...[...STATIC_CODE_OWNED_BLOG_SLUGS].filter(slug => !isRedirectAliasBlogSlug(slug)).map(slug => ({ url: `/blog/${slug}`, label: slug.replaceAll("-", " ").replace(/^./, c => c.toUpperCase()), kind: "Blog" as const })),
  ];
  const redirects = new Set(legacyMarketingRedirectSourcePaths());
  const unique = new Map<string, EditorLinkTarget>();
  for (const target of targets) {
    if (!isSeoRebuildGonePath(target.url) && !redirects.has(target.url) && !unique.has(target.url)) unique.set(target.url, target);
  }
  return [...unique.values()];
}

export function searchEditorLinkTargets(targets: EditorLinkTarget[], query: string): EditorLinkTarget[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return targets.filter(target => terms.every(term => `${target.label} ${target.url} ${target.kind}`.toLowerCase().includes(term))).slice(0, 30);
}
