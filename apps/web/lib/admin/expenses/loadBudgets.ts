import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";

export type BudgetLineWithActual = {
  id: string;
  category_id: string | null;
  branch_id: string | null;
  vendor_id: string | null;
  category_name: string | null;
  branch_name: string | null;
  vendor_name: string | null;
  budget_cents: number;
  actual_cents: number;
  remaining_cents: number;
  variance_cents: number;
  progress_percent: number;
  alert_level: "ok" | "warn_80" | "warn_90" | "warn_100" | "over";
};

export type BudgetWithLines = {
  id: string;
  name: string;
  period_type: "month" | "year";
  period_start: string;
  period_end: string;
  lines: BudgetLineWithActual[];
  totals: {
    budget_cents: number;
    actual_cents: number;
    remaining_cents: number;
    variance_cents: number;
    progress_percent: number;
  };
};

function alertLevel(progress: number): BudgetLineWithActual["alert_level"] {
  if (progress > 100) return "over";
  if (progress >= 100) return "warn_100";
  if (progress >= 90) return "warn_90";
  if (progress >= 80) return "warn_80";
  return "ok";
}

export async function loadBudgetWithActuals(
  admin: SupabaseClient,
  budgetId: string,
): Promise<BudgetWithLines | null> {
  const { data: budget, error } = await admin
    .from("finance_budgets")
    .select("id, name, period_type, period_start, period_end")
    .eq("id", budgetId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!budget) return null;

  const { data: lines, error: linesErr } = await admin
    .from("finance_budget_lines")
    .select("id, category_id, branch_id, vendor_id, amount_cents")
    .eq("budget_id", budgetId);

  if (linesErr) throw new Error(linesErr.message);

  const { data: categories } = await admin.from("expense_categories").select("id, name");
  const { data: cities } = await admin.from("cities").select("id, name");
  const { data: vendors } = await admin.from("expense_vendors").select("id, name");

  const catMap = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const cityMap = new Map((cities ?? []).map((c) => [c.id, c.name]));
  const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v.name]));

  const { data: expenses } = await admin
    .from("expenses")
    .select("amount_cents, category_id, branch_id, vendor_id")
    .eq("status", "approved")
    .gte("expense_date", budget.period_start)
    .lte("expense_date", budget.period_end);

  const enriched: BudgetLineWithActual[] = (lines ?? []).map((line) => {
    const actual = (expenses ?? [])
      .filter((e) => {
        if (line.category_id && e.category_id !== line.category_id) return false;
        if (line.branch_id && e.branch_id !== line.branch_id) return false;
        if (line.vendor_id && e.vendor_id !== line.vendor_id) return false;
        return true;
      })
      .reduce((s, e) => s + (e.amount_cents ?? 0), 0);

    const budgetCents = line.amount_cents;
    const remaining = budgetCents - actual;
    const progress = budgetCents > 0 ? Math.round((actual / budgetCents) * 10000) / 100 : 0;

    return {
      id: line.id,
      category_id: line.category_id,
      branch_id: line.branch_id,
      vendor_id: line.vendor_id,
      category_name: line.category_id ? catMap.get(line.category_id) ?? null : null,
      branch_name: line.branch_id ? cityMap.get(line.branch_id) ?? null : null,
      vendor_name: line.vendor_id ? vendorMap.get(line.vendor_id) ?? null : null,
      budget_cents: budgetCents,
      actual_cents: actual,
      remaining_cents: remaining,
      variance_cents: actual - budgetCents,
      progress_percent: progress,
      alert_level: alertLevel(progress),
    };
  });

  const totalBudget = enriched.reduce((s, l) => s + l.budget_cents, 0);
  const totalActual =
    enriched.length > 0
      ? enriched.reduce((s, l) => s + l.actual_cents, 0)
      : await sumApprovedExpensesInRange(admin, budget.period_start, budget.period_end);

  const totalProgress = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 10000) / 100 : 0;

  return {
    ...budget,
    period_type: budget.period_type as "month" | "year",
    lines: enriched,
    totals: {
      budget_cents: totalBudget,
      actual_cents: totalActual,
      remaining_cents: totalBudget - totalActual,
      variance_cents: totalActual - totalBudget,
      progress_percent: totalProgress,
    },
  };
}

export async function checkBudgetAlerts(admin: SupabaseClient): Promise<
  Array<{ budget_id: string; budget_name: string; line_id: string; alert_level: string; message: string }>
> {
  const { data: budgets } = await admin
    .from("finance_budgets")
    .select("id, name")
    .eq("is_active", true);

  const alerts: Array<{
    budget_id: string;
    budget_name: string;
    line_id: string;
    alert_level: string;
    message: string;
  }> = [];

  for (const b of budgets ?? []) {
    const detail = await loadBudgetWithActuals(admin, b.id);
    if (!detail) continue;
    for (const line of detail.lines) {
      if (line.alert_level === "ok") continue;
      const label = line.category_name ?? line.branch_name ?? line.vendor_name ?? "Budget line";
      alerts.push({
        budget_id: b.id,
        budget_name: b.name,
        line_id: line.id,
        alert_level: line.alert_level,
        message: `${label} is at ${line.progress_percent}% of budget (${line.alert_level.replace("warn_", "")})`,
      });
    }
  }

  return alerts;
}
