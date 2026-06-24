import { SITE_ORIGIN } from "@/lib/site/canonical";

const LOCAL_DEV_ORIGIN = "http://localhost:3000";

function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

/** Site origin for email links. No trailing slash. */
export function getPublicAppUrlBase(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    const normalized = normalizeOrigin(raw);
    // Ignore mis-set localhost in production (common Vercel copy-paste from .env.local).
    if (process.env.NODE_ENV === "development" || !isLoopbackOrigin(normalized)) {
      return normalized;
    }
  }
  if (process.env.NODE_ENV === "development") return LOCAL_DEV_ORIGIN;
  /** Production default matches SEO canonical (`NEXT_PUBLIC_SITE_URL` or apex). */
  return SITE_ORIGIN;
}
