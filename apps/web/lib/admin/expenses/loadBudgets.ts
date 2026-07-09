import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingCustomerRevenueCents } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";
import { INCOME_BUDGET_SERVICE_LABELS } from "@/lib/admin/expenses/budgetServiceOptions";
import { canonicalizeBookingServiceSlug } from "@/lib/booking/canonicalizeBookingServiceSlug";

export type BudgetAlertLevel = "ok" | "warn_80" | "warn_90" | "warn_100" | "over" | "under";

export type BudgetLineWithActual = {
  id: string;
  category_id: string | null;
  branch_id: string | null;
  vendor_id: string | null;
  service_slug: string | null;
  is_total_line: boolean;
  category_name: string | null;
  branch_name: string | null;
  vendor_name: string | null;
  service_name: string | null;
  budget_cents: number;
  actual_cents: number;
  remaining_cents: number;
  variance_cents: number;
  progress_percent: number;
  alert_level: BudgetAlertLevel;
};

export type BudgetWithLines = {
  id: string;
  name: string;
  budget_type: "expense" | "income";
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

type BudgetLineRow = {
  id: string;
  category_id: string | null;
  branch_id: string | null;
  vendor_id: string | null;
  service_slug: string | null;
  is_total_line: boolean;
  amount_cents: number;
};

type BookingRevenueRow = {
  city_id: string | null;
  service_slug: string | null;
  service: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  total_paid_cents: number | null;
  earnings_summary?: unknown;
};

function expenseAlertLevel(progress: number): BudgetAlertLevel {
  if (progress > 100) return "over";
  if (progress >= 100) return "warn_100";
  if (progress >= 90) return "warn_90";
  if (progress >= 80) return "warn_80";
  return "ok";
}

function incomeAlertLevel(progress: number): BudgetAlertLevel {
  if (progress >= 100) return "ok";
  if (progress >= 90) return "warn_100";
  if (progress >= 80) return "warn_90";
  if (progress >= 60) return "warn_80";
  return "under";
}

function lineLabel(line: BudgetLineWithActual): string {
  if (line.is_total_line) return "Total sales";
  return (
    line.category_name ??
    line.branch_name ??
    line.vendor_name ??
    line.service_name ??
    "Budget line"
  );
}

async function loadCompletedBookingRevenueInRange(
  admin: SupabaseClient,
  from: string,
  to: string,
): Promise<BookingRevenueRow[]> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "city_id, service_slug, service, total_paid_zar, amount_paid_cents, total_paid_cents, earnings_summary",
    )
    .eq("status", "completed")
    .eq("is_test", false)
    .gte("date", from)
    .lte("date", to)
    .limit(5000);

  if (error) throw new Error(error.message);
  return (data ?? []) as BookingRevenueRow[];
}

function bookingServiceSlug(booking: BookingRevenueRow): string {
  const raw = booking.service_slug ?? booking.service;
  const canonical = canonicalizeBookingServiceSlug(raw);
  const token = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (token.includes("office")) return "office";
  return canonical;
}

function bookingMatchesIncomeLine(
  booking: BookingRevenueRow,
  line: Pick<BudgetLineRow, "branch_id" | "service_slug" | "is_total_line">,
): boolean {
  if (line.is_total_line) return true;
  if (line.branch_id && booking.city_id !== line.branch_id) return false;
  if (line.service_slug) {
    if (bookingServiceSlug(booking) !== line.service_slug) return false;
  }
  return true;
}

function sumBookingRevenue(bookings: BookingRevenueRow[]): number {
  return bookings.reduce((s, b) => s + bookingCustomerRevenueCents(b), 0);
}

function buildLineActuals(
  budgetType: "expense" | "income",
  line: BudgetLineRow,
  lookups: {
    catMap: Map<string, string>;
    cityMap: Map<string, string>;
    vendorMap: Map<string, string>;
  },
  expenses: Array<{
    amount_cents: number | null;
    category_id: string | null;
    branch_id: string | null;
    vendor_id: string | null;
  }>,
  bookings: BookingRevenueRow[],
): BudgetLineWithActual {
  const actual =
    budgetType === "income"
      ? sumBookingRevenue(bookings.filter((b) => bookingMatchesIncomeLine(b, line)))
      : (expenses ?? [])
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
  const alertFn = budgetType === "income" ? incomeAlertLevel : expenseAlertLevel;

  return {
    id: line.id,
    category_id: line.category_id,
    branch_id: line.branch_id,
    vendor_id: line.vendor_id,
    service_slug: line.service_slug,
    is_total_line: line.is_total_line,
    category_name: line.category_id ? lookups.catMap.get(line.category_id) ?? null : null,
    branch_name: line.branch_id ? lookups.cityMap.get(line.branch_id) ?? null : null,
    vendor_name: line.vendor_id ? lookups.vendorMap.get(line.vendor_id) ?? null : null,
    service_name: line.service_slug ? INCOME_BUDGET_SERVICE_LABELS[line.service_slug] ?? line.service_slug : null,
    budget_cents: budgetCents,
    actual_cents: actual,
    remaining_cents: remaining,
    variance_cents: actual - budgetCents,
    progress_percent: progress,
    alert_level: alertFn(progress),
  };
}

export async function loadBudgetWithActuals(
  admin: SupabaseClient,
  budgetId: string,
): Promise<BudgetWithLines | null> {
  const { data: budget, error } = await admin
    .from("finance_budgets")
    .select("id, name, budget_type, period_type, period_start, period_end")
    .eq("id", budgetId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!budget) return null;

  const budgetType = (budget.budget_type ?? "expense") as "expense" | "income";

  const { data: lines, error: linesErr } = await admin
    .from("finance_budget_lines")
    .select("id, category_id, branch_id, vendor_id, service_slug, is_total_line, amount_cents")
    .eq("budget_id", budgetId);

  if (linesErr) throw new Error(linesErr.message);

  const { data: categories } = await admin.from("expense_categories").select("id, name");
  const { data: cities } = await admin.from("cities").select("id, name");
  const { data: vendors } = await admin.from("expense_vendors").select("id, name");

  const lookups = {
    catMap: new Map((categories ?? []).map((c) => [c.id, c.name])),
    cityMap: new Map((cities ?? []).map((c) => [c.id, c.name])),
    vendorMap: new Map((vendors ?? []).map((v) => [v.id, v.name])),
  };

  const [expenses, bookings] = await Promise.all([
    budgetType === "expense"
      ? admin
          .from("expenses")
          .select("amount_cents, category_id, branch_id, vendor_id")
          .eq("status", "approved")
          .gte("expense_date", budget.period_start)
          .lte("expense_date", budget.period_end)
          .then((r) => {
            if (r.error) throw new Error(r.error.message);
            return r.data ?? [];
          })
      : Promise.resolve([]),
    budgetType === "income"
      ? loadCompletedBookingRevenueInRange(admin, budget.period_start, budget.period_end)
      : Promise.resolve([]),
  ]);

  const lineRows = (lines ?? []) as BudgetLineRow[];
  const enriched = lineRows.map((line) =>
    buildLineActuals(budgetType, line, lookups, expenses, bookings),
  );

  const totalBudget = enriched.reduce((s, l) => s + l.budget_cents, 0);
  const totalActual =
    enriched.length > 0
      ? enriched.reduce((s, l) => s + l.actual_cents, 0)
      : budgetType === "income"
        ? sumBookingRevenue(bookings)
        : await sumApprovedExpensesInRange(admin, budget.period_start, budget.period_end);

  const totalProgress = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 10000) / 100 : 0;

  return {
    id: budget.id,
    name: budget.name,
    budget_type: budgetType,
    period_type: budget.period_type as "month" | "year",
    period_start: budget.period_start,
    period_end: budget.period_end,
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
      const label = lineLabel(line);
      const message =
        detail.budget_type === "income"
          ? `${label} is at ${line.progress_percent}% of sales target`
          : `${label} is at ${line.progress_percent}% of budget (${line.alert_level.replace("warn_", "")})`;
      alerts.push({
        budget_id: b.id,
        budget_name: b.name,
        line_id: line.id,
        alert_level: line.alert_level,
        message,
      });
    }
  }

  return alerts;
}
