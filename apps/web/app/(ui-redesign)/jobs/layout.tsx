import type { ReactNode } from "react";
import { JobsShell } from "@/src/features/jobs/JobsShell";

export const metadata = {
  title: "Jobs | Shalean Cleaner Workspace",
  description: "Your job offers, schedule, and earnings.",
  robots: { index: false, follow: false },
};

export default function JobsLayout({ children }: { children: ReactNode }) {
  return <JobsShell>{children}</JobsShell>;
}
