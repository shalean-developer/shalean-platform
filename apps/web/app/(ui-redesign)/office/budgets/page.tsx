"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Pencil, Plus, RefreshCw, Target, TrendingDown, TrendingUp } from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoPrimaryButton,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { BudgetFormPanel } from "@/components/admin/expenses/BudgetFormPanel";
import { useAdminData } from "@/hooks/useAdminData";
import type { BudgetAlertLevel, BudgetLineWithActual, BudgetWithLines } from "@/lib/admin/expenses/loadBudgets";
import { cn } from "@/lib/utils";

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

const EXPENSE_ALERT_CLS: Record<BudgetAlertLevel, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  warn_80: "bg-amber-50 text-amber-700",
  warn_90: "bg-amber-100 text-amber-800",
  warn_100: "bg-orange-100 text-orange-800",
  over: "bg-red-100 text-red-700",
  under: "bg-red-100 text-red-700",
};

const INCOME_ALERT_CLS: Record<BudgetAlertLevel, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  warn_80: "bg-amber-50 text-amber-700",
  warn_90: "bg-amber-100 text-amber-800",
  warn_100: "bg-orange-100 text-orange-800",
  over: "bg-emerald-100 text-emerald-700",
  under: "bg-red-100 text-red-700",
};

type BudgetListItem = {
  id: string;
  name: string;
  budget_type: "expense" | "income";
  period_type: string;
  period_start: string;
  period_end: string;
};

function lineTargetLabel(line: BudgetLineWithActual): string {
  if (line.is_total_line) return "Total sales";
  return line.category_name ?? line.branch_name ?? line.vendor_name ?? line.service_name ?? "—";
}

function alertLabel(budgetType: "expense" | "income", level: BudgetAlertLevel): string {
  if (level === "ok") return "OK";
  if (budgetType === "income") {
    if (level === "under") return "Behind";
    if (level === "over") return "Exceeded";
    return `${level.replace("warn_", "")}% of target`;
  }
  if (level === "over") return "Over";
  return level.replace("warn_", "");
}

export default function BudgetsPage() {
  const searchParams = useSearchParams();
  const urlBudgetId = (searchParams.get("id") ?? "").trim();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithLines | null>(null);

  const { data: listData, loading: listLoading, error: listError, refetch: refetchList } = useAdminData<{
    items: BudgetListItem[];
  }>("/api/admin/budgets");

  const detailParams = useMemo(() => (selectedId ? { id: selectedId } : undefined), [selectedId]);
  const { data: detail, loading: detailLoading, error: detailError, refetch: refetchDetail } =
    useAdminData<BudgetWithLines>("/api/admin/budgets", { params: detailParams, enabled: !!selectedId });

  const budgets = listData?.items ?? [];
  const isIncome = detail?.budget_type === "income";

  useEffect(() => {
    if (!urlBudgetId) return;
    setSelectedId(urlBudgetId);
  }, [urlBudgetId]);

  function handleBudgetSaved(budgetId: string) {
    refetchList();
    if (editingBudget) {
      refetchDetail();
    } else if (budgetId) {
      setSelectedId(budgetId);
    }
  }

  function openCreateForm() {
    setEditingBudget(null);
    setFormOpen(true);
  }

  function openEditForm() {
    if (!detail) return;
    setEditingBudget(detail);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingBudget(null);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Budget management"
        subtitle="Expense spending and income sales targets by category, branch, service, or vendor"
        live
        actions={
          <>
            <OfficeZohoSecondaryButton
              onClick={() => {
                refetchList();
                if (selectedId) refetchDetail();
              }}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
            <OfficeZohoPrimaryButton onClick={openCreateForm}>
              <Plus className="h-4 w-4" /> Add budget
            </OfficeZohoPrimaryButton>
          </>
        }
      />

      {listError ? <p className="text-sm text-red-600">{listError}</p> : null}

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
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800">{b.name}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        b.budget_type === "income"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {b.budget_type === "income" ? "Sales" : "Expense"}
                    </span>
                  </div>
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
              <p className="text-sm text-slate-500">Select a budget to view actual vs planned figures.</p>
            </div>
          ) : detailLoading ? (
            <p className="px-6 py-12 text-sm text-slate-500">Loading budget detail…</p>
          ) : detailError ? (
            <p className="px-6 py-12 text-sm text-red-600">{detailError}</p>
          ) : detail ? (
            <>
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-800">{detail.name}</h2>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        isIncome ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {isIncome ? "Sales" : "Expense"}
                    </span>
                  </div>
                  <OfficeZohoSecondaryButton onClick={openEditForm}>
                    <Pencil className="h-4 w-4" /> Edit
                  </OfficeZohoSecondaryButton>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>
                    {isIncome ? "Target" : "Budget"}: <strong>{formatZar(detail.totals.budget_cents)}</strong>
                  </span>
                  <span>
                    Actual: <strong>{formatZar(detail.totals.actual_cents)}</strong>
                  </span>
                  <span>
                    {isIncome ? "Gap" : "Remaining"}:{" "}
                    <strong
                      className={
                        isIncome
                          ? detail.totals.remaining_cents > 0
                            ? "text-amber-700"
                            : "text-emerald-700"
                          : detail.totals.remaining_cents < 0
                            ? "text-red-600"
                            : "text-emerald-700"
                      }
                    >
                      {formatZar(Math.abs(detail.totals.remaining_cents))}
                      {isIncome && detail.totals.remaining_cents > 0 ? " short" : isIncome ? " ahead" : ""}
                    </strong>
                  </span>
                  <span>
                    Progress: <strong>{detail.totals.progress_percent}%</strong>
                  </span>
                </div>
              </div>
              <OfficeZohoTableShell>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3 text-right">{isIncome ? "Target" : "Budget"}</th>
                      <th className="px-4 py-3 text-right">Actual</th>
                      <th className="px-4 py-3 text-right">{isIncome ? "Gap" : "Variance"}</th>
                      <th className="px-4 py-3 text-right">Progress</th>
                      <th className="px-4 py-3">Alert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          No budget lines configured.
                        </td>
                      </tr>
                    ) : (
                      detail.lines.map((line) => {
                        const ahead = line.variance_cents >= 0;
                        const alertCls = (isIncome ? INCOME_ALERT_CLS : EXPENSE_ALERT_CLS)[line.alert_level];
                        return (
                          <tr key={line.id} className="border-b border-slate-50">
                            <td className="px-4 py-3 text-slate-800">{lineTargetLabel(line)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{formatZar(line.budget_cents)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{formatZar(line.actual_cents)}</td>
                            <td
                              className={cn(
                                "px-4 py-3 text-right tabular-nums",
                                isIncome
                                  ? ahead
                                    ? "text-emerald-700"
                                    : "text-amber-700"
                                  : line.variance_cents > 0
                                    ? "text-red-600"
                                    : "text-emerald-700",
                              )}
                            >
                              {isIncome ? (
                                <span className="inline-flex items-center justify-end gap-1">
                                  {ahead ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                  {formatZar(Math.abs(line.variance_cents))}
                                </span>
                              ) : (
                                formatZar(line.variance_cents)
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{line.progress_percent}%</td>
                            <td className="px-4 py-3">
                              {line.alert_level !== "ok" ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                                    alertCls,
                                  )}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {alertLabel(detail.budget_type, line.alert_level)}
                                </span>
                              ) : (
                                <span className="text-xs text-emerald-600">OK</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </OfficeZohoTableShell>
            </>
          ) : null}
        </section>
      </div>

      <BudgetFormPanel
        open={formOpen}
        onClose={closeForm}
        onSaved={handleBudgetSaved}
        editBudget={editingBudget}
      />
    </div>
  );
}
