"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchUserRoleClient } from "@/lib/auth/resolvePostAuthDestination";
import type { AppUserRole } from "@/lib/auth/userRole";
import { readCachedUserRole } from "@/lib/auth/userRole";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

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
};

/**
 * Lightweight role guard — no full-page "Checking access" spinner.
 * Redirects unauthenticated users to `/login`; wrong role to the correct dashboard.
 */
export function useRoleRouteGuard({ requiredRole, trustCache = true }: Options): {
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

      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token?.trim();
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
  }, [requiredRole, trustCache]);

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
      router.replace(`/login?redirect=${next}`);
      return;
    }
    if (state.status === "missing_profile") {
      router.replace("/complete-profile");
      return;
    }
    if (state.status === "wrong_role") {
      router.replace(state.actualRoute);
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
