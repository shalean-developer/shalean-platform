"use client";

import type { ReactNode } from "react";
import { DashboardAuthGate } from "@/components/dashboard/dashboard-auth-gate";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardToastProvider } from "@/components/dashboard/dashboard-toast-context";

export function DashboardRouteLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardToastProvider>
      <DashboardAuthGate>
        <DashboardShell>{children}</DashboardShell>
      </DashboardAuthGate>
    </DashboardToastProvider>
  );
}
