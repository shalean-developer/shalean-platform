import {
  blogSlugFromPathname,
  isRedirectAliasBlogSlug,
  normalizeBlogHref,
} from "@/lib/blog/validBlogRoutes";
import {
  noteEditorialHrefNormalized,
  noteEditorialRedirectAliasInput,
} from "@/lib/blog/editorialLinkObservability";

/**
 * Normalize internal editorial URLs (blog redirect chains, shalean absolute URLs).
 * Preserves `mailto:` / `tel:` / external hosts unchanged.
 */
export function sanitizeEditorialHref(href: string): string {
  const t = href.trim();
  if (!t) return t;
  const pathOnly = t.split(/[?#]/)[0] ?? t;
  const slug = blogSlugFromPathname(pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`);
  if (slug && isRedirectAliasBlogSlug(slug)) {
    noteEditorialRedirectAliasInput(t);
  }
  const out = normalizeBlogHref(t);
  if (out !== t) noteEditorialHrefNormalized(t, out);
  return out;
}

/**
 * Rewrite `href` attributes in CMS HTML blobs to canonical blog paths.
 * Run after tag/attribute allowlisting (e.g. {@link sanitizeBlogRichHtml}).
 */
export function sanitizeEditorialHtml(html: string): string {
  if (!html) return html;
  return html.replace(/\bhref\s*=\s*(["'])([^"']*)\1/gi, (_full, quote: string, rawHref: string) => {
    const next = sanitizeEditorialHref(rawHref);
    return `href=${quote}${next}${quote}`;
  });
}

/** Rewrite markdown `[label](url)` targets through {@link sanitizeEditorialHref}. */
export function sanitizeEditorialMarkdown(md: string): string {
  if (!md) return md;
  return md.replace(/\]\(([^)]+)\)/g, (full, inner: string) => {
    const raw = String(inner).trim();
    const sanitized = sanitizeEditorialHref(raw);
    return sanitized === raw ? full : `](${sanitized})`;
  });
}
