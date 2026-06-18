"use client";

import type { ReactNode } from "react";
import { RoleGuardRetryBanner, useRoleRouteGuard } from "@/lib/auth/useRoleRouteGuard";
import { CleanerNavBadgesProvider } from "@/components/cleaner-dashboard/CleanerNavBadgesContext";
import { CleanerNotificationsProvider } from "@/lib/notifications/notificationsStore";
import { CleanerLifecycleFlushErrorListener } from "@/components/cleaner-dashboard/CleanerLifecycleFlushErrorListener";
import { JobsBottomNav } from "./JobsNav";

export function JobsShell({ children }: { children: ReactNode }) {
  const { state, retry } = useRoleRouteGuard({ requiredRole: "cleaner" });

  if (state.status === "unauthenticated" || state.status === "missing_profile" || state.status === "wrong_role") {
    return null;
  }

  if (state.status === "checking") {
    return (
      <div className="min-h-dvh bg-gray-50 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg animate-pulse space-y-4 px-4 py-8" aria-hidden>
          <div className="h-28 rounded-2xl bg-slate-200" />
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
        </div>
        <JobsBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      {state.status === "timeout" ? <RoleGuardRetryBanner onRetry={retry} /> : null}
      <CleanerNavBadgesProvider>
        <CleanerNotificationsProvider>
          <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</div>
          <JobsBottomNav />
          <CleanerLifecycleFlushErrorListener />
        </CleanerNotificationsProvider>
      </CleanerNavBadgesProvider>
    </div>
  );
}
