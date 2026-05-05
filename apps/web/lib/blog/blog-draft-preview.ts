/**
 * Draft / scheduled post preview via `?preview=` on `/blog/[slug]`.
 *
 * - **Development:** `?preview=true` is allowed (fast local QA).
 * - **Production:** set `BLOG_DRAFT_PREVIEW_TOKEN` and use `?preview=<that token>` (never ship `preview=true` publicly).
 */
export function isBlogDraftPreviewAllowed(previewQuery: string | null | undefined): boolean {
  const token = previewQuery?.trim();
  if (!token) {
    if (process.env.NODE_ENV === "development") {
      console.log("[blog-draft-preview] IS_PREVIEW_MODE: false (no ?preview= query)");
    }
    return false;
  }
  if (process.env.NODE_ENV === "development" && token === "true") {
    console.log("[blog-draft-preview] IS_PREVIEW_MODE: true (dev + preview=true)");
    return true;
  }
  const secret = process.env.BLOG_DRAFT_PREVIEW_TOKEN?.trim();
  const ok = Boolean(secret && token === secret);
  if (process.env.NODE_ENV === "development") {
    console.log("[blog-draft-preview] IS_PREVIEW_MODE:", ok, "(token vs BLOG_DRAFT_PREVIEW_TOKEN)");
  }
  return ok;
}
