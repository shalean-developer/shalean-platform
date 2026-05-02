/**
 * One-tap directions: iOS → Apple Maps; Android → `google.navigation:`; desktop → Google Maps web.
 */
export function directionsHrefFromQuery(query: string): string {
  const q = String(query ?? "").trim();
  if (!q) return "";
  const encoded = encodeURIComponent(q);
  if (typeof navigator === "undefined") {
    return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  }
  const ua = navigator.userAgent || "";
  const maxTp = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && maxTp > 1);
  if (isIOS) {
    return `maps://?daddr=${encoded}&dirflg=d`;
  }
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) {
    return `google.navigation:q=${encoded}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}
