import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { loadExpenseList } from "@/lib/admin/expenses/loadExpenses";
import { loadFinancialDashboard } from "@/lib/admin/expenses/loadFinancialDashboard";
import { computeProfitBreakdown } from "@/lib/admin/expenses/profitCalculations";
import {
  loadOfficePayoutPeriodReport,
  normalizeOfficePayoutPeriodRange,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const reportType = url.searchParams.get("type") ?? "profit-loss";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const branchId = url.searchParams.get("branch_id") ?? undefined;
  const { from: f, to: t } = normalizeOfficePayoutPeriodRange(from, to);

  try {
    switch (reportType) {
      case "profit-loss": {
        const report = await loadOfficePayoutPeriodReport(admin, f, t);
        const expenses = await sumApprovedExpensesInRange(admin, f, t, branchId);
        const profit = computeProfitBreakdown(
          report.totals.total_revenue_cents,
          report.totals.earned_cents,
          expenses,
        );
        return NextResponse.json({
          type: reportType,
          period: { from: f, to: t },
          profit,
          visit_count: report.totals.visit_count,
        });
      }
      case "expenses":
      case "category":
      case "branch":
      case "vendor":
      case "monthly":
      case "annual": {
        const dashboard = await loadFinancialDashboard(admin, f, t, branchId);
        const list = await loadExpenseList(admin, {
          from: f,
          to: t,
          branch_id: branchId,
          page: 1,
          page_size: 5000,
          status: reportType === "expenses" ? undefined : "approved",
        });

        if (reportType === "vendor") {
          const byVendor = new Map<string, { vendor: string; amount_cents: number; count: number }>();
          for (const item of list.items) {
            const key = item.vendor_name ?? "Unknown";
            const row = byVendor.get(key) ?? { vendor: key, amount_cents: 0, count: 0 };
            row.amount_cents += item.amount_cents;
            row.count += 1;
            byVendor.set(key, row);
          }
          return NextResponse.json({
            type: reportType,
            period: { from: f, to: t },
            vendors: [...byVendor.values()].sort((a, b) => b.amount_cents - a.amount_cents),
          });
        }

        return NextResponse.json({
          type: reportType,
          period: { from: f, to: t },
          expenses: list.items,
          expenses_by_category: dashboard.expenses_by_category,
          expenses_by_branch: dashboard.expenses_by_branch,
          monthly_trend: dashboard.monthly_trend,
          profit: dashboard.profit,
        });
      }
      default:
        return NextResponse.json({ error: "Unknown report type." }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
