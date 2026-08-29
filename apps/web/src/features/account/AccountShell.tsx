"use client";

import type { ReactNode } from "react";
import { DashboardToastProvider } from "@/components/dashboard/dashboard-toast-context";
import { RoleGuardRetryBanner, useRoleRouteGuard } from "@/lib/auth/useRoleRouteGuard";
import { AccountHeader, AccountMobileNav, AccountSidebar } from "./AccountNav";

export function AccountShell({ children }: { children: ReactNode }) {
  const { state, retry } = useRoleRouteGuard({ requiredRole: "customer" });

  if (state.status === "unauthenticated" || state.status === "missing_profile" || state.status === "wrong_role") {
    return null;
  }

  return (
    <DashboardToastProvider>
      <div className="min-h-dvh bg-muted/40 pb-[4.75rem] text-foreground md:pb-0">
        {state.status === "timeout" ? <RoleGuardRetryBanner onRetry={retry} /> : null}
        <AccountSidebar />

        <div className="min-h-dvh md:pl-64">
          <AccountHeader />
          <main className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] py-6 md:py-8">
            {state.status === "checking" ? (
              <div className="animate-pulse space-y-5" aria-hidden>
                <div className="h-8 w-48 rounded-lg bg-muted" />
                <div className="h-32 rounded-2xl border border-border bg-card" />
                <div className="h-32 rounded-2xl border border-border bg-card" />
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
