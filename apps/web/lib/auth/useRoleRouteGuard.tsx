"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchUserRoleClient } from "@/lib/auth/resolvePostAuthDestination";
import type { AppUserRole } from "@/lib/auth/userRole";
import { readCachedUserRole } from "@/lib/auth/userRole";
import { getSupabaseAccessToken, getSupabaseBrowser } from "@/lib/supabase/browser";
import { scheduleAppRouterReplace } from "@/lib/navigation/scheduleAppRouterNavigation";

export type RoleRouteGuardState =
  | { status: "checking" }
  | { status: "unauthenticated" }
  | { status: "ready" }
  | { status: "wrong_role"; actualRole: AppUserRole; actualRoute: string }
  | { status: "timeout" }
  | { status: "missing_profile" };

type Options = {
  requiredRole: AppUserRole;
  /** When cached role matches, render immediately without waiting for network. */
  trustCache?: boolean;
  /**
   * Cleaner routes may be opened by any authenticated user whose Auth user is
   * linked to a cleaner record, even when their primary app role is Supervisor
   * or another Office role. This enables one-login portal switching without
   * widening access for accounts that are not linked to a cleaner profile.
   */
  allowLinkedCleaner?: boolean;
};

type CleanerMeResponse = { cleaner?: { id?: string | null } | null };

export function canUseLinkedCleanerAccess(
  requiredRole: AppUserRole,
  allowLinkedCleaner: boolean,
  linkedCleaner: boolean,
): boolean {
  return requiredRole === "cleaner" && allowLinkedCleaner && linkedCleaner;
}

async function hasLinkedCleaner(token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/cleaner/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const payload = (await response.json().catch(() => ({}))) as CleanerMeResponse;
    return Boolean(payload.cleaner?.id);
  } catch {
    return false;
  }
}

/**
 * Lightweight role guard — no full-page "Checking access" spinner.
 * Redirects unauthenticated users to `/login`; wrong role to the correct dashboard.
 */
export function useRoleRouteGuard({ requiredRole, trustCache = true, allowLinkedCleaner = false }: Options): {
  state: RoleRouteGuardState;
  retry: () => void;
} {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  /** Always start `checking` so SSR and the first client render match (no localStorage in initializer). */
  const [state, setState] = useState<RoleRouteGuardState>({ status: "checking" });
  const runId = useRef(0);

  useLayoutEffect(() => {
    if (trustCache && readCachedUserRole() === requiredRole) {
      setState({ status: "ready" });
    }
  }, [requiredRole, trustCache]);

  const verify = useCallback(async () => {
    const id = ++runId.current;
    try {
      const sb = getSupabaseBrowser();
      if (!sb) {
        setState({ status: "unauthenticated" });
        return;
      }

      const token = (await getSupabaseAccessToken())?.trim();
      if (!token) {
        if (runId.current === id) setState({ status: "unauthenticated" });
        return;
      }

      if (trustCache && readCachedUserRole() === requiredRole) {
        if (runId.current === id) setState({ status: "ready" });
        void fetchUserRoleClient(token).catch(() => undefined);
        return;
      }

      const result = await fetchUserRoleClient(token);
      if (runId.current !== id) return;

      if (result.ok) {
        if (result.role === requiredRole) {
          setState({ status: "ready" });
          return;
        }

        const linkedCleaner =
          requiredRole === "cleaner" && allowLinkedCleaner ? await hasLinkedCleaner(token) : false;
        if (canUseLinkedCleanerAccess(requiredRole, allowLinkedCleaner, linkedCleaner)) {
          if (runId.current === id) setState({ status: "ready" });
          return;
        }

        setState({
          status: "wrong_role",
          actualRole: result.role,
          actualRoute: result.dashboardRoute,
        });
        return;
      }

      switch (result.reason) {
        case "unauthenticated":
          setState({ status: "unauthenticated" });
          break;
        case "missing_profile":
          setState({ status: "missing_profile" });
          break;
        case "timeout":
          setState({ status: "timeout" });
          break;
        case "invalid_role":
          setState({ status: "unauthenticated" });
          break;
        default:
          setState({ status: "timeout" });
          break;
      }
    } catch {
      if (runId.current === id) setState({ status: "timeout" });
    }
  }, [requiredRole, trustCache, allowLinkedCleaner]);

  useEffect(() => {
    void verify();
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange(() => void verify());
    return () => sub.subscription.unsubscribe();
  }, [verify]);

  useEffect(() => {
    if (state.status === "unauthenticated") {
      const next = encodeURIComponent(pathname);
      scheduleAppRouterReplace(router, `/login?redirect=${next}`);
      return;
    }
    if (state.status === "missing_profile") {
      scheduleAppRouterReplace(router, "/complete-profile");
      return;
    }
    if (state.status === "wrong_role") {
      scheduleAppRouterReplace(router, state.actualRoute);
    }
  }, [state, pathname, router]);

  return { state, retry: () => void verify() };
}

export function RoleGuardRetryBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
      role="status"
    >
      Could not verify your access.{" "}
      <button type="button" className="font-semibold underline underline-offset-2" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
