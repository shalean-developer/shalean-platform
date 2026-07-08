const PUBLIC_SITE_ORIGIN = "https://shalean.co.za";

export function isLocalReferralOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Facebook, LinkedIn, etc. cannot crawl localhost. When developing locally, share the
 * public production /refer URL so link previews (title, image, description) work.
 */
export function toPublicReferralShareUrl(shareUrl: string): string {
  try {
    const parsed = new URL(shareUrl);
    if (!isLocalReferralOrigin(parsed.origin)) return shareUrl;
    return `${PUBLIC_SITE_ORIGIN}${parsed.pathname}${parsed.search}`;
  } catch {
    return `${PUBLIC_SITE_ORIGIN}/refer`;
  }
}

export function facebookSharerHref(shareUrl: string): string {
  const publicUrl = toPublicReferralShareUrl(shareUrl);
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`;
}

export function whatsAppShareHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
