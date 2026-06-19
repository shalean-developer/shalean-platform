import type { ReactNode } from "react";
import { AppMonoFontScope } from "@/components/fonts/AppMonoFontScope";
import { DashboardRouteLayout } from "@/components/dashboard/dashboard-route-layout";

export const metadata = {
  title: "Dashboard | Shalean Cleaning Services",
  description: "Manage your bookings, addresses, and payments.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppMonoFontScope>
      <DashboardRouteLayout>{children}</DashboardRouteLayout>
    </AppMonoFontScope>
  );
}
