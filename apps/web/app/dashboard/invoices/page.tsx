"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMonthlyInvoices } from "@/hooks/useMonthlyInvoices";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { daysPastDueJhb, invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";
import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function balanceFor(inv: CustomerMonthlyInvoiceRow): number {
  if (typeof inv.balance_cents === "number" && Number.isFinite(inv.balance_cents)) return inv.balance_cents;
  return Math.max(0, inv.total_amount_cents - inv.amount_paid_cents);
}

export default function DashboardInvoicesPage() {
  const { invoices, loading, error, refetch } = useMonthlyInvoices();
  const sorted = useMemo(() => [...invoices].sort((a, b) => b.month.localeCompare(a.month)), [invoices]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div>
      <PageHeader title="Monthly invoices" description="One bill per month for all your visits on the monthly plan." />

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No invoices yet. Book a clean and visits will roll into your monthly bill.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sorted.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{monthLabel(inv.month)}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">{formatZarFromCents(inv.total_amount_cents)}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">{formatZarFromCents(inv.amount_paid_cents)}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">{formatZarFromCents(balanceFor(inv))}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-zinc-700 dark:text-zinc-300">
                      <span>{customerMonthlyInvoiceStatusLabel(inv.status)}</span>
                      {inv.is_overdue && inv.status !== "paid" ? (
                        <Badge variant="destructive" className="text-[10px] uppercase">
                          Overdue
                        </Badge>
                      ) : null}
                    </div>
                    {inv.is_overdue && inv.status !== "paid" ? (
                      <p className="mt-1 max-w-xs text-xs text-amber-800 dark:text-amber-200">
                        {invoiceOverdueEscalationText(daysPastDueJhb(inv.due_date, new Date()))}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild variant="ghost" size="sm" className="rounded-lg text-blue-600">
                      <Link href={`/dashboard/invoices/${inv.id}`}>View</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
