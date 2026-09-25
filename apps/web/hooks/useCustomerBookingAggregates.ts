"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

export type CustomerBookingAggregates = {
  completedBookingsCount: number;
  payments: { totalPaidZar: number; transactionCount: number };
  perBookingInvoices: { totalCount: number; totalPaidCents: number };
};

export function useCustomerBookingAggregates() {
  const { user, loading: userLoading } = useUser();
  const [aggregates, setAggregates] = useState<CustomerBookingAggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user?.id) {
      setAggregates(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const out = await dashboardFetchJson<{ aggregates?: CustomerBookingAggregates }>("/api/customer/bookings?view=aggregates");
    if (!out.ok || !out.data.aggregates) {
      setAggregates(null);
      setError(out.ok ? "Could not load booking totals." : out.error);
    } else {
      setAggregates(out.data.aggregates);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!userLoading) void refetch();
  }, [userLoading, refetch]);

  return { aggregates, loading: userLoading || loading, error, refetch };
}
