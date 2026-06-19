export type BlogPostViewStatus = "draft" | "published" | "scheduled";

/** Server-side draft preview query (e.g. `?preview=true` or `?preview=<secret>`). */
export function buildBlogDraftPreviewQuery(): string | null {
  if (process.env.NODE_ENV === "development") return "?preview=true";
  const token = process.env.BLOG_DRAFT_PREVIEW_TOKEN?.trim();
  if (!token) return null;
  return `?preview=${encodeURIComponent(token)}`;
}

/**
 * Public blog path for admin "View post". Published posts omit preview; drafts need preview query.
 */
export function buildBlogPostViewPath(
  slug: string,
  status: BlogPostViewStatus,
  draftPreviewQuery?: string | null,
): string | null {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const base = `/blog/${encodeURIComponent(trimmed)}`;
  if (status === "published") return base;

  const query = draftPreviewQuery ?? buildBlogDraftPreviewQuery();
  if (!query) return null;
  return `${base}${query}`;
}

export function blogPostViewLabel(status: BlogPostViewStatus): string {
  return status === "published" ? "View post" : "Preview post";
}
