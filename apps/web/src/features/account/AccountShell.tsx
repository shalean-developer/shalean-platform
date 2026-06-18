"use client";

import type { ReactNode } from "react";
import { DashboardToastProvider } from "@/components/dashboard/dashboard-toast-context";
import { RoleGuardRetryBanner, useRoleRouteGuard } from "@/lib/auth/useRoleRouteGuard";
import { AccountSidebar, AccountTopBar, AccountMobileNav } from "./AccountNav";

export function AccountShell({ children }: { children: ReactNode }) {
  const { state, retry } = useRoleRouteGuard({ requiredRole: "customer" });

  if (state.status === "unauthenticated" || state.status === "missing_profile" || state.status === "wrong_role") {
    return null;
  }

  return (
    <DashboardToastProvider>
      <div className="min-h-dvh bg-gray-50 pb-[4.5rem] md:pb-0">
        {state.status === "timeout" ? <RoleGuardRetryBanner onRetry={retry} /> : null}
        <AccountSidebar />
        <div className="md:pl-64">
          <AccountTopBar />
          <main className="mx-auto max-w-7xl px-4 py-6">
            {state.status === "checking" ? (
              <div className="animate-pulse space-y-4" aria-hidden>
                <div className="h-8 w-48 rounded-lg bg-slate-200" />
                <div className="h-32 rounded-2xl bg-slate-100" />
                <div className="h-32 rounded-2xl bg-slate-100" />
              </div>
            ) : (
              children
            )}
          </main>
        </div>
        <AccountMobileNav />
      </div>
    </DashboardToastProvider>
  );
}
