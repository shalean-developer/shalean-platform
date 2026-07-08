/** Public Supabase bucket for CMS blog uploads (featured + in-article images). */
export const BLOG_MEDIA_BUCKET = "blog-media";

export const BLOG_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export const BLOG_MEDIA_ALLOWED_MIME = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export function blogMediaExtensionForMime(mime: string): string | null {
  return BLOG_MEDIA_ALLOWED_MIME.get(mime.split(";")[0]!.trim().toLowerCase()) ?? null;
}

/** Public object URL for a path inside `blog-media`. */
export function buildBlogMediaPublicUrl(objectPath: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) return null;
  const path = objectPath.replace(/^\/+/, "");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${BLOG_MEDIA_BUCKET}/${path}`;
}

/** Whether a URL points at our public blog-media bucket (for sanitizer allowlist). */
export function isBlogMediaPublicUrl(url: string): boolean {
  const built = buildBlogMediaPublicUrl("");
  if (!built) return false;
  const prefix = built.replace(/\/$/, "");
  return url.startsWith(prefix);
}
