/**
 * Safe post-login / session-recovery targets under `/jobs` (no open redirects, no login loops).
 */
export function sanitizeCleanerPostAuthRedirect(raw: string | null | undefined): string {
  const fallback = "/jobs";
  if (raw == null || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) return fallback;

  if (trimmed.startsWith("/jobs")) {
    if (trimmed.length > 2048) return fallback;
    return trimmed;
  }

  /** Legacy cleaner paths → new workspace */
  if (trimmed.startsWith("/cleaner")) {
    const q = trimmed.indexOf("?");
    const path = (q === -1 ? trimmed : trimmed.slice(0, q)).split("#")[0] ?? trimmed;
    if (path === "/cleaner/login" || path.startsWith("/cleaner/login/")) return fallback;
    if (path === "/cleaner/apply" || path.startsWith("/cleaner/apply/")) return fallback;
    if (path === "/cleaner/dashboard" || path === "/cleaner" || path === "/cleaner/") return fallback;
    if (path.startsWith("/cleaner/jobs/")) {
      const id = path.slice("/cleaner/jobs/".length).split("/")[0];
      if (id) return `/jobs/job/${encodeURIComponent(id)}`;
    }
    if (path.startsWith("/cleaner/jobs")) return "/jobs/list";
    return fallback;
  }

  return fallback;
}
