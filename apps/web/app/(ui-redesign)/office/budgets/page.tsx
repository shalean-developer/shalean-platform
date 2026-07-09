"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Target } from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { useAdminData } from "@/hooks/useAdminData";
import type { BudgetWithLines } from "@/lib/admin/expenses/loadBudgets";
import { cn } from "@/lib/utils";

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

const ALERT_CLS: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  warn_80: "bg-amber-50 text-amber-700",
  warn_90: "bg-amber-100 text-amber-800",
  warn_100: "bg-orange-100 text-orange-800",
  over: "bg-red-100 text-red-700",
};

type BudgetListItem = {
  id: string;
  name: string;
  period_type: string;
  period_start: string;
  period_end: string;
};

export default function BudgetsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: listData, loading: listLoading, refetch: refetchList } = useAdminData<{ items: BudgetListItem[] }>(
    "/api/admin/budgets",
  );

  const detailParams = useMemo(() => (selectedId ? { id: selectedId } : undefined), [selectedId]);
  const { data: detail, loading: detailLoading, refetch: refetchDetail } = useAdminData<BudgetWithLines>(
    "/api/admin/budgets",
    { params: detailParams, enabled: !!selectedId },
  );

  const budgets = listData?.items ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Budget management"
        subtitle="Monthly and yearly budgets by category, branch, and vendor"
        live
        actions={
          <OfficeZohoSecondaryButton onClick={() => { refetchList(); if (selectedId) refetchDetail(); }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </OfficeZohoSecondaryButton>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm lg:col-span-1">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Budgets</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {listLoading ? (
              <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
            ) : budgets.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No budgets configured yet.</p>
            ) : (
              budgets.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-slate-50",
                    selectedId === b.id && "bg-blue-50",
                  )}
                >
                  <p className="font-medium text-slate-800">{b.name}</p>
                  <p className="text-xs text-slate-500">
                    {b.period_type} · {b.period_start} → {b.period_end}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm lg:col-span-2">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <Target className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-500">Select a budget to view actual vs planned spending.</p>
            </div>
          ) : detailLoading ? (
            <p className="px-6 py-12 text-sm text-slate-500">Loading budget detail…</p>
          ) : detail ? (
            <>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-800">{detail.name}</h2>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>Budget: <strong>{formatZar(detail.totals.budget_cents)}</strong></span>
                  <span>Actual: <strong>{formatZar(detail.totals.actual_cents)}</strong></span>
                  <span>Remaining: <strong className={detail.totals.remaining_cents < 0 ? "text-red-600" : "text-emerald-700"}>{formatZar(detail.totals.remaining_cents)}</strong></span>
                  <span>Progress: <strong>{detail.totals.progress_percent}%</strong></span>
                </div>
              </div>
              <OfficeZohoTableShell>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3 text-right">Budget</th>
                      <th className="px-4 py-3 text-right">Actual</th>
                      <th className="px-4 py-3 text-right">Variance</th>
                      <th className="px-4 py-3 text-right">Progress</th>
                      <th className="px-4 py-3">Alert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-50">
                        <td className="px-4 py-3 text-slate-800">
                          {line.category_name ?? line.branch_name ?? line.vendor_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatZar(line.budget_cents)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatZar(line.actual_cents)}</td>
                        <td className={cn("px-4 py-3 text-right tabular-nums", line.variance_cents > 0 ? "text-red-600" : "text-emerald-700")}>
                          {formatZar(line.variance_cents)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{line.progress_percent}%</td>
                        <td className="px-4 py-3">
                          {line.alert_level !== "ok" ? (
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", ALERT_CLS[line.alert_level])}>
                              <AlertTriangle className="h-3 w-3" />
                              {line.alert_level.replace("warn_", "")}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-600">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </OfficeZohoTableShell>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
