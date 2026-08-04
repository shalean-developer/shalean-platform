import type { ReactNode } from "react";
import { AppMonoFontScope } from "@/components/fonts/AppMonoFontScope";
import { OfficeBookingFinancialVisibilityGate } from "@/components/admin/office/OfficeBookingFinancialVisibilityGate";
import { resolveDeploymentEnvironment } from "@/lib/env/deploymentEnvironment";
import { OfficeShell } from "@/src/features/office/OfficeShell";
import { OfficePermissionBoundary } from "@/src/features/office/OfficePermissionBoundary";
import { OfficePermissionNavigationGate } from "@/src/features/office/OfficePermissionNavigationGate";

export const metadata = {
  title: "Office | Shalean Admin",
  description: "Operations console for managing bookings, workforce, and growth.",
  robots: { index: false, follow: false },
};

function OfficeEnvironmentIndicator() {
  const env = resolveDeploymentEnvironment();
  if (env === "production") return null;
  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-1 text-center text-xs font-semibold uppercase tracking-wide text-amber-900"
      data-shalean-office-env={env}
    >
      Admin environment: {env}
    </div>
  );
}

export default function OfficeLayout({ children }: { children: ReactNode }) {
  return (
    <AppMonoFontScope>
      <OfficeEnvironmentIndicator />
      <OfficeBookingFinancialVisibilityGate />
      <OfficePermissionNavigationGate>
        <OfficeShell>
          <OfficePermissionBoundary>{children}</OfficePermissionBoundary>
        </OfficeShell>
      </OfficePermissionNavigationGate>
    </AppMonoFontScope>
  );
}
