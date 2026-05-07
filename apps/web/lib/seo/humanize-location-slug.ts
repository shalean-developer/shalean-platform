/**
 * Turn hub slugs like `sea-point-cleaning-services` into readable titles for dashboards.
 * Prefer `resolveCapeTownHubRowFromAreaInput` when you need a canonical match; this is a safe fallback.
 */
export function humanizeLocationSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!s) return "—";
  return s
    .replace(/-cleaning-services/g, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
