"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";
import type { DashboardBooking } from "@/lib/dashboard/types";
import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";
import { useUser } from "@/hooks/useUser";

export type DashboardSummaryPayload = {
  ym: string;
  bookingsThisMonthCount: number;
  nextBooking: DashboardBooking | null;
  recentBookings: DashboardBooking[];
  invoiceThisMonth: CustomerMonthlyInvoiceRow | null;
  hasAnyInvoices: boolean;
  /** Current month’s invoice is overdue (balance + due date / flag). */
  isOverdue: boolean;
  daysOverdue: number;
  /** Any invoice row for this customer is overdue. */
  hasOverdueInvoice: boolean;
};

export function useDashboardSummary(): {
  summary: DashboardSummaryPayload | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { user, loading: userLoading } = useUser();
  const [summary, setSummary] = useState<DashboardSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!user?.id) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const out = await dashboardFetchJson<DashboardSummaryPayload>("/api/dashboard/summary", { method: "GET" });
    if (!out.ok) {
      setError(out.error);
      setSummary(null);
    } else {
      const d = out.data;
      setSummary({
        ...d,
        isOverdue: d.isOverdue ?? false,
        daysOverdue: typeof d.daysOverdue === "number" && Number.isFinite(d.daysOverdue) ? d.daysOverdue : 0,
        hasOverdueInvoice: d.hasOverdueInvoice ?? d.isOverdue ?? false,
      });
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (userLoading) return;
    void fetchSummary();
  }, [userLoading, fetchSummary]);

  return {
    summary,
    loading: userLoading || loading,
    error,
    refetch: fetchSummary,
  };
}
