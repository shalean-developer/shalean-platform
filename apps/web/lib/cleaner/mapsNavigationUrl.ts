/**
 * First line of a multi-line address — used as the maps search query.
 */
export function firstLineOfAddress(raw: string | null | undefined): string {
  const loc = String(raw ?? "").trim();
  if (!loc) return "";
  return loc.split(/\r?\n/)[0]?.trim() ?? loc;
}

/**
 * Opens Google Maps on most platforms; Apple Maps on iOS (same query string).
 */
export function mapsNavigationUrlForQuery(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  const encoded = encodeURIComponent(q);
  if (typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return `https://maps.apple.com/?q=${encoded}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

export function mapsNavigationUrlFromJobLocation(location: string | null | undefined): string | null {
  return mapsNavigationUrlForQuery(firstLineOfAddress(location));
}
