/**
 * Safe post-login / session-recovery targets under `/cleaner` (no open redirects, no login loops).
 * Return a raw path+query string; callers must encode when embedding (e.g. `encodeURIComponent` for `location.assign`,
 * or `URLSearchParams.set` on the server which encodes automatically).
 */
export function sanitizeCleanerPostAuthRedirect(raw: string | null | undefined): string {
  const fallback = "/cleaner/dashboard";
  if (raw == null || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) return fallback;
  if (!trimmed.startsWith("/cleaner")) return fallback;

  const q = trimmed.indexOf("?");
  const path = (q === -1 ? trimmed : trimmed.slice(0, q)).split("#")[0] ?? trimmed;
  if (path === "/cleaner/login" || path.startsWith("/cleaner/login/")) return fallback;
  if (path === "/cleaner/apply" || path.startsWith("/cleaner/apply/")) return fallback;
  if (path === "/cleaner" || path === "/cleaner/") return fallback;

  if (trimmed.length > 2048) return fallback;
  return trimmed;
}
