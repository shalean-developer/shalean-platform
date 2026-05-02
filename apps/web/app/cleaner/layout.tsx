import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CleanerRouteShell } from "@/components/cleaner-dashboard/CleanerRouteShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CleanerLayout({ children }: { children: ReactNode }) {
  return <CleanerRouteShell>{children}</CleanerRouteShell>;
}
