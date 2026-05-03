const STORAGE_KEY = "shalean.auth.intent";

export type AuthRoleIntent = "customer" | "cleaner";

export function parseIntentQuery(v: string | null | undefined): AuthRoleIntent | null {
  if (v == null) return null;
  const x = String(v).trim().toLowerCase();
  if (x === "customer" || x === "cleaner") return x;
  return null;
}

export function getAuthIntent(): AuthRoleIntent | null {
  if (typeof window === "undefined") return null;
  return parseIntentQuery(window.localStorage.getItem(STORAGE_KEY));
}

export function setAuthIntent(intent: AuthRoleIntent): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, intent);
}

export function clearAuthIntent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * `?intent=` from the URL wins and is mirrored into localStorage for the next visit.
 */
export function getResolvedAuthIntent(urlIntent: string | null | undefined): AuthRoleIntent | null {
  const fromUrl = parseIntentQuery(urlIntent);
  if (fromUrl) {
    setAuthIntent(fromUrl);
    return fromUrl;
  }
  return getAuthIntent();
}
