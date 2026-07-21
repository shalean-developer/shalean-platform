import "server-only";

/**
 * Admin access helpers.
 *
 * - UI / routing: `user_profiles.role === "admin"` via resolve-profile.
 * - Admin APIs: {@link evaluateAdminAccess} — profile role **or** email on
 *   `ADMIN_EMAILS` ∪ `ADMIN_EMAIL` (optional bootstrap allowlist).
 *
 * New Office admins only need `user_profiles.role = 'admin'`. Env allowlist is
 * optional and does not require a redeploy for each new account.
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

/** True when at least one bootstrap admin email is configured. */
export function isAdminAllowlistConfigured(): boolean {
  return adminEmailList().length > 0;
}

/** True when email is on the optional `ADMIN_EMAILS` / `ADMIN_EMAIL` bootstrap allowlist. */
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
 * Email-allowlist-only decision (legacy / bootstrap). Prefer
 * {@link evaluateAdminAccess} for Admin API authorization so profile-role
 * admins are accepted without an env redeploy.
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
