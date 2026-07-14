import type { ReactNode } from "react";
import { AppMonoFontScope } from "@/components/fonts/AppMonoFontScope";
import { resolveDeploymentEnvironment } from "@/lib/env/deploymentEnvironment";
import { OfficeShell } from "@/src/features/office/OfficeShell";

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
      <OfficeShell>{children}</OfficeShell>
    </AppMonoFontScope>
  );
}
