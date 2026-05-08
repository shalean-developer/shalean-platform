import { normalizeBlogHref } from "@/lib/blog/validBlogRoutes";

/**
 * Mirrors `next.config` cleanup redirects so internal links point at canonical destinations (fewer redirect hops).
 * Safe on server and client; no I/O.
 */
export function resolveInternalBlogHref(href: string): string {
  return normalizeBlogHref(href);
}
