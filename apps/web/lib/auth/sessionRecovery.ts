/**
 * Shared session-expiry / recovery copy for protected UI and API clients.
 * Keeps messaging consistent without weakening auth checks.
 */

export const SESSION_EXPIRED_MESSAGE = "Your session expired. Sign in again to continue.";
export const SESSION_REVOKED_MESSAGE = "This session is no longer valid. Sign in again.";
export const SESSION_REFRESH_FAILED_MESSAGE =
  "We could not refresh your session. Sign in again to continue.";

export function sessionRecoveryLoginPath(redirectPath?: string | null): string {
  const raw = String(redirectPath ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return "/login";
  }
  return `/login?redirect=${encodeURIComponent(raw)}`;
}

/** Map API/auth error text to a clear recovery message (never invents success). */
export function mapSessionFailureMessage(raw: string | null | undefined): string {
  const m = String(raw ?? "").trim().toLowerCase();
  if (!m) return SESSION_EXPIRED_MESSAGE;
  if (m.includes("revoked") || m.includes("logged out") || m.includes("session_not_found")) {
    return SESSION_REVOKED_MESSAGE;
  }
  if (m.includes("refresh") && (m.includes("invalid") || m.includes("fail"))) {
    return SESSION_REFRESH_FAILED_MESSAGE;
  }
  if (m.includes("expired") || m.includes("invalid") || m.includes("jwt")) {
    return SESSION_EXPIRED_MESSAGE;
  }
  return SESSION_EXPIRED_MESSAGE;
}
