"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function CleanerEarningsTab({
  loading,
  error,
  today,
  week,
  month,
  rows,
}: {
  loading?: boolean;
  error?: string | null;
  today: number;
  week: number;
  month: number;
  rows: {
    id: string;
    serviceLabel: string;
    payoutZar: number | null;
    bonusZar: number;
    totalEarningsZar: number | null;
    payoutStatus: "paid" | "pending";
  }[];
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-24 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
          ))}
        </div>
        <div className="h-20 animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border-blue-100 shadow-sm dark:border-blue-900/30">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Today</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">R{today.toLocaleString("en-ZA")}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">This week</p>
            <p className="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">R{week.toLocaleString("en-ZA")}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">This month</p>
            <p className="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">R{month.toLocaleString("en-ZA")}</p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent jobs</h2>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          Completed jobs with payouts will show here.
        </p>
      ) : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{row.serviceLabel}</p>
                  <Badge variant={row.payoutStatus === "paid" ? "default" : "warning"}>
                    {row.payoutStatus === "paid" ? "Paid" : "Pending"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  {row.totalEarningsZar == null ? (
                    <span className="font-semibold text-amber-700 dark:text-amber-300">Pending payout calculation</span>
                  ) : (
                    <>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                        Total R{row.totalEarningsZar.toLocaleString("en-ZA")}
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Payout R{(row.payoutZar ?? 0).toLocaleString("en-ZA")}
                      </span>
                      {row.bonusZar > 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-300">
                          Bonus R{row.bonusZar.toLocaleString("en-ZA")}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
