"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import SlideOverPanel from "@/components/admin/SlideOverPanel";
import { adminFetch } from "@/hooks/useAdminData";
import { showToast } from "@/components/ui/notifications";
import { INCOME_BUDGET_SERVICE_OPTIONS } from "@/lib/admin/expenses/budgetServiceOptions";
import type { BudgetLineWithActual, BudgetWithLines } from "@/lib/admin/expenses/loadBudgets";
import type { ExpenseCategoryRow } from "@/lib/admin/expenses/types";
import { cn } from "@/lib/utils";

type City = { id: string; name: string };
type Vendor = { id: string; name: string };
type BudgetType = "expense" | "income";
type ExpenseTargetType = "category" | "branch" | "vendor";
type IncomeTargetType = "total" | "branch" | "service";

type LineDraft = {
  key: string;
  targetType: ExpenseTargetType | IncomeTargetType;
  categoryId: string;
  branchId: string;
  vendorId: string;
  serviceSlug: string;
  amountZar: string;
  notes: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (budgetId: string) => void;
  editBudget?: BudgetWithLines | null;
};

function centsToZarInput(cents: number): string {
  return String(Math.round(cents / 100));
}

function lineFromBudgetLine(line: BudgetLineWithActual, budgetType: BudgetType): LineDraft {
  const amountZar = centsToZarInput(line.budget_cents);
  if (budgetType === "income") {
    let targetType: IncomeTargetType = "total";
    if (line.is_total_line) targetType = "total";
    else if (line.branch_id) targetType = "branch";
    else if (line.service_slug) targetType = "service";
    return {
      key: line.id,
      targetType,
      categoryId: "",
      branchId: line.branch_id ?? "",
      vendorId: "",
      serviceSlug: line.service_slug ?? "",
      amountZar,
      notes: "",
    };
  }
  let targetType: ExpenseTargetType = "category";
  if (line.category_id) targetType = "category";
  else if (line.branch_id) targetType = "branch";
  else if (line.vendor_id) targetType = "vendor";
  return {
    key: line.id,
    targetType,
    categoryId: line.category_id ?? "",
    branchId: line.branch_id ?? "",
    vendorId: line.vendor_id ?? "",
    serviceSlug: "",
    amountZar,
    notes: "",
  };
}

function zarToCents(raw: string): number | null {
  const cleaned = raw.replace(/[R\s,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function defaultPeriodDates(periodType: "month" | "year"): { start: string; end: string } {
  const now = new Date();
  if (periodType === "year") {
    const y = now.getFullYear();
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

function emptyLine(budgetType: BudgetType): LineDraft {
  return {
    key: crypto.randomUUID(),
    targetType: budgetType === "income" ? "total" : "category",
    categoryId: "",
    branchId: "",
    vendorId: "",
    serviceSlug: "",
    amountZar: "",
    notes: "",
  };
}

export function BudgetFormPanel({ open, onClose, onSaved, editBudget = null }: Props) {
  const isEdit = !!editBudget?.id;
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [budgetType, setBudgetType] = useState<BudgetType>("expense");
  const [name, setName] = useState("");
  const [periodType, setPeriodType] = useState<"month" | "year">("month");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine("expense")]);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    Promise.all([
      adminFetch<{ categories: ExpenseCategoryRow[] }>("/api/admin/expenses/categories"),
      adminFetch<{ vendors: Vendor[] }>("/api/admin/expenses/vendors"),
      fetch("/api/cities").then((r) => r.json()),
    ]).then(([cats, vends, cityData]) => {
      if (cats.ok) setCategories(cats.data?.categories ?? []);
      if (vends.ok) setVendors(vends.data?.vendors ?? []);
      setCities((cityData.cities ?? []).filter((c: City & { is_active?: boolean }) => c.is_active !== false));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editBudget) {
      setBudgetType(editBudget.budget_type);
      setName(editBudget.name);
      setPeriodType(editBudget.period_type);
      setPeriodStart(editBudget.period_start);
      setPeriodEnd(editBudget.period_end);
      setLines(
        editBudget.lines.length > 0
          ? editBudget.lines.map((line) => lineFromBudgetLine(line, editBudget.budget_type))
          : [emptyLine(editBudget.budget_type)],
      );
      setLineErrors({});
      return;
    }
    const { start, end } = defaultPeriodDates("month");
    setBudgetType("expense");
    setName("");
    setPeriodType("month");
    setPeriodStart(start);
    setPeriodEnd(end);
    setLines([emptyLine("expense")]);
    setLineErrors({});
  }, [open, editBudget]);

  function lineHasTarget(line: LineDraft): boolean {
    if (budgetType === "income") {
      if (line.targetType === "total") return true;
      if (line.targetType === "branch") return !!line.branchId;
      return !!line.serviceSlug;
    }
    if (line.targetType === "category") return !!line.categoryId;
    if (line.targetType === "branch") return !!line.branchId;
    return !!line.vendorId;
  }

  function lineIsEmpty(line: LineDraft): boolean {
    return !line.amountZar.trim() && !lineHasTarget(line);
  }

  const groupedCategories = useMemo(() => {
    const map = new Map<string, ExpenseCategoryRow[]>();
    for (const c of categories) {
      const list = map.get(c.group_name) ?? [];
      list.push(c);
      map.set(c.group_name, list);
    }
    return [...map.entries()];
  }, [categories]);

  function handleBudgetTypeChange(next: BudgetType) {
    setBudgetType(next);
    setLines([emptyLine(next)]);
    setLineErrors({});
  }

  function handlePeriodTypeChange(next: "month" | "year") {
    setPeriodType(next);
    const { start, end } = defaultPeriodDates(next);
    setPeriodStart(start);
    setPeriodEnd(end);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setLineErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !periodStart || !periodEnd) {
      showToast("Fill in budget name and period dates.", "error");
      return;
    }
    if (periodEnd < periodStart) {
      showToast("Period end must be on or after period start.", "error");
      return;
    }

    const payloadLines: Array<Record<string, unknown>> = [];
    const nextLineErrors: Record<string, string> = {};

    for (const line of lines) {
      if (lineIsEmpty(line)) continue;

      const cents = zarToCents(line.amountZar);
      const hasTarget = lineHasTarget(line);

      if (!hasTarget && !cents) {
        nextLineErrors[line.key] = "Select a target and enter an amount.";
        continue;
      }
      if (!hasTarget) {
        nextLineErrors[line.key] =
          budgetType === "income"
            ? line.targetType === "branch"
              ? "Select a branch for this line."
              : line.targetType === "service"
                ? "Select a service for this line."
                : "Select a target for this line."
            : `Select a ${line.targetType} for this line.`;
        continue;
      }
      if (!cents) {
        nextLineErrors[line.key] = "Enter a valid amount for this line.";
        continue;
      }

      if (budgetType === "income") {
        payloadLines.push({
          is_total_line: line.targetType === "total",
          branch_id: line.targetType === "branch" ? line.branchId : undefined,
          service_slug: line.targetType === "service" ? line.serviceSlug : undefined,
          amount_cents: cents,
          notes: line.notes.trim() || undefined,
        });
      } else {
        payloadLines.push({
          category_id: line.targetType === "category" ? line.categoryId : undefined,
          branch_id: line.targetType === "branch" ? line.branchId : undefined,
          vendor_id: line.targetType === "vendor" ? line.vendorId : undefined,
          amount_cents: cents,
          notes: line.notes.trim() || undefined,
        });
      }
    }

    if (Object.keys(nextLineErrors).length > 0) {
      setLineErrors(nextLineErrors);
      showToast("Fix the highlighted budget lines before saving.", "error");
      return;
    }
    setLineErrors({});

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        budget_type: budgetType,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        lines: payloadLines,
      };
      const res = isEdit
        ? await adminFetch<{ id: string }>(`/api/admin/budgets/${editBudget!.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await adminFetch<{ id: string }>("/api/admin/budgets", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error(res.error ?? "Save failed.");
      showToast(
        isEdit
          ? "Budget updated."
          : budgetType === "income"
            ? "Sales budget created."
            : "Budget created.",
        "success",
      );
      onSaved(isEdit ? editBudget!.id : (res.data?.id ?? ""));
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit budget" : "New budget"}
      subtitle={
        budgetType === "income"
          ? "Set sales targets by branch or service"
          : "Set planned spending by category, branch, or vendor"
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Budget type *</label>
          <select
            value={budgetType}
            onChange={(e) => handleBudgetTypeChange(e.target.value as BudgetType)}
            disabled={isEdit}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
          >
            <option value="expense">Expense spending</option>
            <option value="income">Income / sales</option>
          </select>
          {isEdit ? (
            <p className="mt-1 text-xs text-slate-500">Budget type cannot be changed after creation.</p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Budget name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={budgetType === "income" ? "e.g. July 2026 Sales" : "e.g. July 2026 Operations"}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Period type *</label>
            <select
              value={periodType}
              onChange={(e) => handlePeriodTypeChange(e.target.value as "month" | "year")}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Start *</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">End *</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-slate-600">Budget lines</label>
              <p className="text-xs text-slate-500">
                {budgetType === "income"
                  ? "Each line needs a sales target and amount. Actuals come from completed bookings."
                  : "Each line needs a target and amount. Leave blank to skip."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine(budgetType)])}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div
                key={line.key}
                className={cn(
                  "rounded-lg border bg-slate-50/50 p-3",
                  lineErrors[line.key] ? "border-red-300 bg-red-50/40" : "border-slate-200",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Line {idx + 1}</span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      title="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Target type</label>
                    <select
                      value={line.targetType}
                      onChange={(e) =>
                        updateLine(line.key, {
                          targetType: e.target.value as LineDraft["targetType"],
                          categoryId: "",
                          branchId: "",
                          vendorId: "",
                          serviceSlug: "",
                        })
                      }
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    >
                      {budgetType === "income" ? (
                        <>
                          <option value="total">Total sales</option>
                          <option value="branch">Branch</option>
                          <option value="service">Service</option>
                        </>
                      ) : (
                        <>
                          <option value="category">Category</option>
                          <option value="branch">Branch</option>
                          <option value="vendor">Vendor</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">
                      {budgetType === "income" ? "Target (ZAR)" : "Amount (ZAR)"} *
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.amountZar}
                      onChange={(e) => updateLine(line.key, { amountZar: e.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                {budgetType === "income" ? (
                  line.targetType === "branch" ? (
                    <div className="mt-2">
                      <label className="mb-1 block text-xs text-slate-500">Branch *</label>
                      {cities.length === 0 ? (
                        <p className="text-xs text-amber-700">No branches available.</p>
                      ) : (
                        <select
                          value={line.branchId}
                          onChange={(e) => updateLine(line.key, { branchId: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        >
                          <option value="">Select branch…</option>
                          {cities.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ) : line.targetType === "service" ? (
                    <div className="mt-2">
                      <label className="mb-1 block text-xs text-slate-500">Service *</label>
                      <select
                        value={line.serviceSlug}
                        onChange={(e) => updateLine(line.key, { serviceSlug: e.target.value })}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">Select service…</option>
                        {INCOME_BUDGET_SERVICE_OPTIONS.map((s) => (
                          <option key={s.slug} value={s.slug}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Tracks all completed booking revenue in this period.</p>
                  )
                ) : (
                  <div className="mt-2">
                    <label className="mb-1 block text-xs text-slate-500">
                      {line.targetType === "category" ? "Category" : line.targetType === "branch" ? "Branch" : "Vendor"} *
                    </label>
                    {line.targetType === "category" ? (
                      categories.length === 0 ? (
                        <p className="text-xs text-amber-700">No categories available. Add expense categories first.</p>
                      ) : (
                        <select
                          value={line.categoryId}
                          onChange={(e) => updateLine(line.key, { categoryId: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        >
                          <option value="">Select category…</option>
                          {groupedCategories.map(([group, items]) => (
                            <optgroup key={group} label={group}>
                              {items.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      )
                    ) : line.targetType === "branch" ? (
                      cities.length === 0 ? (
                        <p className="text-xs text-amber-700">No branches available.</p>
                      ) : (
                        <select
                          value={line.branchId}
                          onChange={(e) => updateLine(line.key, { branchId: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        >
                          <option value="">Select branch…</option>
                          {cities.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )
                    ) : vendors.length === 0 ? (
                      <p className="text-xs text-amber-700">No vendors available. Add vendors under Expenses first.</p>
                    ) : (
                      <select
                        value={line.vendorId}
                        onChange={(e) => updateLine(line.key, { vendorId: e.target.value })}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">Select vendor…</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {lineErrors[line.key] ? (
                  <p className="mt-2 text-xs text-red-600">{lineErrors[line.key]}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-md bg-[#408df7] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3578d4] disabled:opacity-50"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : isEdit ? "Save changes" : "Create budget"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </SlideOverPanel>
  );
}
