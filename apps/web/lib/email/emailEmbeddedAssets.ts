import { getPublicAppUrlBase } from "@/lib/email/appUrl";

/** Absolute URL for a file under `apps/web/public/` (same host as the sending domain). */
export function publicEmailAssetUrl(relativePath: string): string {
  const base = getPublicAppUrlBase().replace(/\/$/, "");
  return `${base}/${relativePath.replace(/^\//, "")}`;
}

/** Hosted logo — Resend flags base64 `data:` image URIs as off-domain. */
export function getEmbeddedShaleanLogoDataUri(): string {
  return publicEmailAssetUrl("images/shalean-logo.png");
}

/** Hosted social icon PNGs used in the branded email footer. */
export function getEmbeddedEmailSocialIconDataUri(id: "facebook" | "instagram" | "whatsapp"): string {
  return publicEmailAssetUrl(`images/email/social-${id}.png`);
}
