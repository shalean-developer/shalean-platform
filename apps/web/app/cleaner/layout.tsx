import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppMonoFontScope } from "@/components/fonts/AppMonoFontScope";
import { CleanerRouteShell } from "@/components/cleaner-dashboard/CleanerRouteShell";
import { CleanerIssueReportControl } from "@/components/cleaner/CleanerIssueReportControl";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CleanerLayout({ children }: { children: ReactNode }) {
  return (
    <AppMonoFontScope>
      <CleanerIssueReportControl />
      <CleanerRouteShell>{children}</CleanerRouteShell>
    </AppMonoFontScope>
  );
}
