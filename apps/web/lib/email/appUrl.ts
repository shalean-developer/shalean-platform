import { SITE_ORIGIN } from "@/lib/site/canonical";

/** Site origin for email links. No trailing slash. */
export function getPublicAppUrlBase(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  /** Production default matches SEO canonical (`NEXT_PUBLIC_SITE_URL` or apex). */
  return SITE_ORIGIN;
}
