import { useQuery } from "@tanstack/react-query";
import { getCustomerDashboardApi } from "@/services/customerApi";
import type { DashboardSummaryPayload } from "@/services/types/dashboard";
import { useAuth } from "@/providers/AuthProvider";

export const dashboardSummaryQueryKey = ["customer", "dashboard", "summary"] as const;

export function useDashboardSummary() {
  const { status } = useAuth();

  return useQuery({
    queryKey: dashboardSummaryQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<DashboardSummaryPayload> => {
      const result = await getCustomerDashboardApi().summary<DashboardSummaryPayload>();
      if (!result.ok) {
        throw new Error(result.error || "Could not load your home summary.");
      }
      const d = result.data;
      return {
        ...d,
        bookingsThisMonthCount: Number(d.bookingsThisMonthCount) || 0,
        hoursBookedThisMonth: Number(d.hoursBookedThisMonth) || 0,
        completedThisMonthCount: Number(d.completedThisMonthCount) || 0,
        totalSpentThisMonthCents: Number(d.totalSpentThisMonthCents) || 0,
        recentBookings: Array.isArray(d.recentBookings) ? d.recentBookings : [],
        perVisitInvoices: Array.isArray(d.perVisitInvoices) ? d.perVisitInvoices : [],
        isOverdue: Boolean(d.isOverdue),
        daysOverdue: Number(d.daysOverdue) || 0,
        hasOverdueInvoice: Boolean(d.hasOverdueInvoice ?? d.isOverdue),
        hasAnyInvoices: Boolean(d.hasAnyInvoices),
      };
    },
    staleTime: 30_000,
  });
}
