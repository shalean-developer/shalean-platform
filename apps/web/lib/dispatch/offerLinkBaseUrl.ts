import { DEFAULT_PUBLIC_APP_ORIGIN } from "@/lib/site/defaultPublicOrigin";

/**
 * Base URL for SMS offer links (`{base}/offer/{token}`).
 * Uses OFFER_SMS_BASE_URL or NEXT_PUBLIC_APP_URL when set; otherwise dev localhost or production default.
 */
export function getOfferSmsLinkBaseUrl(): string {
  const explicit = process.env.OFFER_SMS_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  /** Same as `getPublicAppUrlBase()` production default when env is unset. */
  return DEFAULT_PUBLIC_APP_ORIGIN;
}

/** Tracked redirect (`GET /r/offer/:token` → metrics → `/offer/:token`) for SMS click analytics. */
export function getOfferSmsTrackedUrl(offerToken: string): string {
  const t = String(offerToken ?? "").trim();
  const base = getOfferSmsLinkBaseUrl();
  return `${base}/r/offer/${encodeURIComponent(t)}`;
}
