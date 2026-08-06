import type { ReactNode } from "react";
import { AppMonoFontScope } from "@/components/fonts/AppMonoFontScope";
import { JobsShell } from "@/src/features/jobs/JobsShell";
import { SupervisorModeSwitcher } from "@/src/features/office/SupervisorModeSwitcher";

export const metadata = {
  title: "Jobs | Shalean Cleaner Workspace",
  description: "Your job offers, schedule, and earnings.",
  robots: { index: false, follow: false },
};

export default function JobsLayout({ children }: { children: ReactNode }) {
  return (
    <AppMonoFontScope>
      <JobsShell>
        <div className="mx-auto w-full max-w-lg px-4 pt-3">
          <SupervisorModeSwitcher activeMode="cleaner" />
        </div>
        {children}
      </JobsShell>
    </AppMonoFontScope>
  );
}
