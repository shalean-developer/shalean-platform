import "server-only";

/**
 * Admin dual-gate helpers.
 *
 * Gate A (UI / routing): `user_profiles.role === "admin"` via resolve-profile.
 * Gate B (Admin APIs): email ∈ `ADMIN_EMAILS` ∪ `ADMIN_EMAIL` via {@link isAdmin}.
 *
 * Both gates are intentional. Do not remove either without governance approval.
 */

function adminEmailList(): string[] {
  const fromList = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const single = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (single && !fromList.includes(single)) return [...fromList, single];
  return fromList;
}

/** True when at least one admin email is configured (Gate B). */
export function isAdminAllowlistConfigured(): boolean {
  return adminEmailList().length > 0;
}

export function isAdmin(email?: string | null) {
  if (!email) return false;
  const admins = adminEmailList();
  if (admins.length === 0) return false;
  return admins.includes(email.toLowerCase());
}

export type AdminAllowlistDecision =
  | { ok: true }
  | { ok: false; status: 403 | 503; error: string };

/**
 * Gate B evaluation after a valid session email is known.
 * Empty allowlist is an operational misconfiguration (503), not a soft allow.
 */
export function evaluateAdminAllowlist(email?: string | null): AdminAllowlistDecision {
  if (!isAdminAllowlistConfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        "Admin allowlist is not configured (ADMIN_EMAILS). Set staging/production Preview env and redeploy; existing sessions need a fresh sign-in after allowlist updates.",
    };
  }
  if (!email || !isAdmin(email)) {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  return { ok: true };
}
