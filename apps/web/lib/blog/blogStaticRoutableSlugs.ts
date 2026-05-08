import {
  blogSlugFromPathname,
  DEV_BLOG_STATIC_LINK_ALLOWLIST,
  normalizeBlogHref,
} from "@/lib/blog/validBlogRoutes";

/**
 * @deprecated use {@link DEV_BLOG_STATIC_LINK_ALLOWLIST} from `validBlogRoutes.ts`.
 */
export const STATIC_BLOG_SLUG_ALLOWLIST = DEV_BLOG_STATIC_LINK_ALLOWLIST;

/** Dev-only: warn when an internal `/blog/...` href is not covered by the static governance allowlist (CMS may still serve). */
export function warnIfLikelyBrokenBlogHrefDev(href: string, context?: string): void {
  if (process.env.NODE_ENV !== "development") return;
  const normalized = normalizeBlogHref(href);
  const pathOnly = normalized.split(/[?#]/)[0] ?? normalized;
  if (!pathOnly.startsWith("/blog/")) return;
  const slug = blogSlugFromPathname(pathOnly);
  if (!slug) return;
  if (DEV_BLOG_STATIC_LINK_ALLOWLIST.has(slug)) return;
  console.warn(
    `[blog link] href may 404 (not in static governance pool): /blog/${slug}${context ? ` — ${context}` : ""}`,
  );
}
