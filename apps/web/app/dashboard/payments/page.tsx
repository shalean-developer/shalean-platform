"use client";

import { useMemo } from "react";
import { useBookings } from "@/hooks/useBookings";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardPaymentsPage() {
  const { bookings, loading, error, refetch } = useBookings();

  const rows = useMemo(() => {
    return [...bookings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [bookings]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div>
      <PageHeader title="Payments" description="Receipts linked to your bookings." />

      {error ? (
        <p className="mb-4 text-sm text-red-600">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border-zinc-200/80 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
        <CardContent className="divide-y divide-zinc-100 p-0 dark:divide-zinc-800">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">No payments yet.</div>
          ) : (
            rows.map((b) => {
              const paid = b.status !== "cancelled" && b.status !== "failed";
              const label = paid ? "Paid" : b.status === "cancelled" ? "Refunded" : "Failed";
              const variant = paid ? ("success" as const) : ("outline" as const);
              const dateLabel = new Date(b.createdAt).toLocaleDateString("en-ZA", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              return (
                <div key={b.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{dateLabel}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Booking ref {b.paystackReference}</p>
                    <p className="text-xs text-zinc-400">{b.serviceName}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">R {b.priceZar.toLocaleString("en-ZA")}</p>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
