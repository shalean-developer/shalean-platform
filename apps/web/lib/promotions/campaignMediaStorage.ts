/** Public Supabase bucket for campaign / social creative uploads. */
export const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

export const CAMPAIGN_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export const CAMPAIGN_MEDIA_ALLOWED_MIME = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export function campaignMediaExtensionForMime(mime: string): string | null {
  return CAMPAIGN_MEDIA_ALLOWED_MIME.get(mime.split(";")[0]!.trim().toLowerCase()) ?? null;
}

/** Public object URL for a path inside `campaign-media`. */
export function buildCampaignMediaPublicUrl(objectPath: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) return null;
  const path = objectPath.replace(/^\/+/, "");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${CAMPAIGN_MEDIA_BUCKET}/${path}`;
}

export function isCampaignMediaPublicUrl(url: string): boolean {
  const built = buildCampaignMediaPublicUrl("");
  if (!built) return false;
  const prefix = built.replace(/\/$/, "");
  return url.startsWith(prefix);
}

/** Extract storage object path from a campaign-media public URL, if any. */
export function campaignMediaPathFromPublicUrl(url: string): string | null {
  if (!isCampaignMediaPublicUrl(url)) return null;
  const marker = `/storage/v1/object/public/${CAMPAIGN_MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0] ?? "") || null;
}
