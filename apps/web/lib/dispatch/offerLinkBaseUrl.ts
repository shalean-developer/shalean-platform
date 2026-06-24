import { getPublicAppUrlBase } from "@/lib/email/appUrl";

/**
 * Base URL for SMS offer links (`{base}/offer/{token}`).
 * Uses OFFER_SMS_BASE_URL when set; otherwise same resolution as `getPublicAppUrlBase()`.
 */
export function getOfferSmsLinkBaseUrl(): string {
  const sms = process.env.OFFER_SMS_BASE_URL?.trim();
  if (sms) return sms.replace(/\/+$/, "");
  return getPublicAppUrlBase();
}

/** Tracked redirect (`GET /r/offer/:token` → metrics → `/offer/:token`) for SMS click analytics. */
export function getOfferSmsTrackedUrl(offerToken: string): string {
  const t = String(offerToken ?? "").trim();
  const base = getOfferSmsLinkBaseUrl();
  return `${base}/r/offer/${encodeURIComponent(t)}`;
}
