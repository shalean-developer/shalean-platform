export type BlogPostViewStatus = "draft" | "published" | "scheduled";

/** Server-side draft preview query (e.g. `?preview=true` or `?preview=<secret>`). */
export function buildBlogDraftPreviewQuery(): string | null {
  return null; // Preview queries are minted per post by the authorized server endpoint.
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
