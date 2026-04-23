import type { ReactNode } from "react";
import { DashboardRouteLayout } from "@/components/dashboard/dashboard-route-layout";

export const metadata = {
  title: "Dashboard | Shalean Cleaning Services",
  description: "Manage your bookings, addresses, and payments.",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardRouteLayout>{children}</DashboardRouteLayout>;
}
