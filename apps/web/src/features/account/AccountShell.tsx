"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LifeBuoy } from "lucide-react";
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
          <div className="border-b border-gray-100 bg-white px-4 py-2">
            <div className="mx-auto flex max-w-7xl justify-end">
              <Link href="/account/cases" className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                <LifeBuoy className="h-3.5 w-3.5" /> Support cases
              </Link>
            </div>
          </div>
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
