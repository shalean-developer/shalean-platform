import type { AppUserRole } from "@/lib/auth/userRole";
import {
  cacheUserRole,
  dashboardRouteForRole,
  ROLE_FETCH_TIMEOUT_MS,
  safePostLoginRedirect,
} from "@/lib/auth/userRole";

export type ResolveProfileApiResponse = {
  ok?: boolean;
  role?: AppUserRole;
  dashboardRoute?: string;
  missingProfile?: boolean;
  invalidRole?: boolean;
  error?: string;
};

export type ResolvePostAuthResult =
  | { kind: "redirect"; path: string; role: AppUserRole | null }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

/**
 * After email/password sign-in, resolve role from `user_profiles.role` and pick the dashboard route.
 * Caches `shalean_user_role` + `shalean_dashboard_route` in localStorage on success, but callers
 * must use the role returned here for security-sensitive routing because browser storage is best-effort.
 */
export async function resolvePostAuthDestination(
  accessToken: string,
  redirectParam?: string | null,
): Promise<ResolvePostAuthResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await resolvePostAuthDestinationOnce(accessToken, redirectParam);
    if (result.kind !== "timeout" || attempt === 1) return result;
  }
  return { kind: "timeout" };
}

async function resolvePostAuthDestinationOnce(
  accessToken: string,
  redirectParam?: string | null,
): Promise<ResolvePostAuthResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ROLE_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch("/api/auth/resolve-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as ResolveProfileApiResponse;

    if (res.status === 401) {
      return { kind: "error", message: json.error ?? "Session expired. Sign in again." };
    }

    if (json.missingProfile) {
      return { kind: "redirect", path: "/complete-profile", role: null };
    }

    if (json.invalidRole) {
      return { kind: "redirect", path: "/login", role: null };
    }

    if (!res.ok || !json.ok || !json.role) {
      return { kind: "error", message: json.error ?? "Could not load your account role. Try again." };
    }

    cacheUserRole(json.role);
    const path = safePostLoginRedirect(redirectParam, json.role);
    return {
      kind: "redirect",
      path: path || json.dashboardRoute || dashboardRouteForRole(json.role),
      role: json.role,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { kind: "timeout" };
    }
    const msg = e instanceof Error ? e.message : "Could not verify your account.";
    return { kind: "error", message: msg };
  } finally {
    window.clearTimeout(timer);
  }
}

export type FetchUserRoleResult =
  | { ok: true; role: AppUserRole; dashboardRoute: string }
  | { ok: false; reason: "unauthenticated" | "missing_profile" | "invalid_role" | "timeout" | "error"; message?: string };

/** Client-side role fetch for route guards. */
export async function fetchUserRoleClient(accessToken: string): Promise<FetchUserRoleResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ROLE_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch("/api/auth/resolve-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as ResolveProfileApiResponse;

    if (res.status === 401) return { ok: false, reason: "unauthenticated" };
    if (json.missingProfile) return { ok: false, reason: "missing_profile" };
    if (json.invalidRole) return { ok: false, reason: "invalid_role" };
    if (!res.ok || !json.ok || !json.role) {
      return { ok: false, reason: "error", message: json.error ?? "Could not verify role." };
    }

    cacheUserRole(json.role);
    return {
      ok: true,
      role: json.role,
      dashboardRoute: json.dashboardRoute ?? dashboardRouteForRole(json.role),
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : "Network error." };
  } finally {
    window.clearTimeout(timer);
  }
}
