import { DEFAULT_PUBLIC_APP_ORIGIN } from "@/lib/site/defaultPublicOrigin";

/** Site origin for email links. No trailing slash. */
export function getPublicAppUrlBase(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  /** `NEXT_PUBLIC_APP_URL` unset in production — canonical public origin (`.co.za`). */
  return DEFAULT_PUBLIC_APP_ORIGIN;
}
