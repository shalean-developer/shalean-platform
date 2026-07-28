/**
 * Browser GA4 identity helpers — used to stitch Measurement Protocol `purchase`
 * to the same client/session that emitted the booking funnel events.
 */

import { getGa4MeasurementId } from "@/lib/analytics/ga4Config";

const GA_CLIENT_STORAGE_KEY = "shalean_ga4_client_id";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // Malformed percent-encoding must never block checkout identity helpers.
    return null;
  }
}

/**
 * Parse GA4 client id from `_ga` cookie (`GA1.1.<part1>.<part2>` → `<part1>.<part2>`).
 */
export function parseGaClientIdFromCookie(raw: string | null | undefined): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length >= 4) {
    const id = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    return /^\d+\.\d+$/.test(id) ? id : null;
  }
  if (/^\d+\.\d+$/.test(value)) return value;
  return null;
}

/** Stable browser client_id for GA4 MP (cookie → storage → generated). */
export function getGa4BrowserClientId(): string | null {
  if (typeof window === "undefined") return null;
  const fromCookie = parseGaClientIdFromCookie(readCookie("_ga"));
  if (fromCookie) {
    try {
      window.localStorage.setItem(GA_CLIENT_STORAGE_KEY, fromCookie);
    } catch {
      /* ignore */
    }
    return fromCookie;
  }
  try {
    const stored = window.localStorage.getItem(GA_CLIENT_STORAGE_KEY)?.trim();
    if (stored && /^\d+\.\d+$/.test(stored)) return stored;
  } catch {
    /* ignore */
  }
  // Generate a GA-shaped id if gtag has not written `_ga` yet (early funnel → later purchase).
  const generated = `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
  try {
    window.localStorage.setItem(GA_CLIENT_STORAGE_KEY, generated);
  } catch {
    /* ignore */
  }
  return generated;
}

/** Optional GA4 session id from the active Measurement ID cookie (`_ga_<id without G->`). */
export function getGa4BrowserSessionId(): string | null {
  if (typeof document === "undefined") return null;
  const measurementId = getGa4MeasurementId();
  const cookieName = `_ga_${measurementId.replace(/^G-/, "")}`;
  const raw = readCookie(cookieName);
  if (!raw) return null;
  // GS2.1.s<sessionId>$o... or GS1.1.<sessionId>...
  const m = raw.match(/\.s(\d+)/) || raw.match(/^GS\d+\.\d+\.(\d+)/);
  return m?.[1] ?? null;
}

export function getGa4BrowserIdentity(): { gaClientId: string | null; gaSessionId: string | null } {
  return {
    gaClientId: getGa4BrowserClientId(),
    gaSessionId: getGa4BrowserSessionId(),
  };
}

/** Fields to attach to payment-session / Paystack metadata (no PII). */
export function getGa4CheckoutIdentityFields(): {
  gaClientId?: string;
  gaSessionId?: string;
} {
  const { gaClientId, gaSessionId } = getGa4BrowserIdentity();
  return {
    ...(gaClientId ? { gaClientId } : {}),
    ...(gaSessionId ? { gaSessionId } : {}),
  };
}
