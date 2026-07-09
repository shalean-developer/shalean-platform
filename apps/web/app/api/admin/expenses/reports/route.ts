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
import { loadPaymentTransactionMetrics } from "@/lib/payments/loadPaymentTransactionMetrics";
import { loadReferralPromoCostTotals } from "@/lib/admin/referrals/loadReferralPromoCosts";
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
        const promo = await loadReferralPromoCostTotals(admin, f, t, branchId);
        const gatewayPayments = await loadPaymentTransactionMetrics(admin, f, t, { branchId });
        const profit = computeProfitBreakdown(
          report.totals.total_revenue_cents,
          report.totals.earned_cents,
          expenses,
          promo.referral_discount_cost_cents,
          promo.cleaning_credit_cost_cents,
        );
        return NextResponse.json({
          type: reportType,
          period: { from: f, to: t },
          profit,
          promo_costs: promo,
          gateway_payments: gatewayPayments,
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
      case "cash-flow":
      case "cleaner-cost":
      case "executive-monthly":
      case "executive-annual": {
        const dashboard = await loadFinancialDashboard(admin, f, t, branchId);
        const report = await loadOfficePayoutPeriodReport(admin, f, t);
        const payload = {
          type: reportType,
          period: { from: f, to: t },
          profit: dashboard.profit,
          monthly_trend: dashboard.monthly_trend,
          profit_by_branch: dashboard.profit_by_branch,
          expenses_by_category: dashboard.expenses_by_category,
          cleaner_payouts_cents: report.totals.earned_cents,
          visit_count: report.totals.visit_count,
          executive_kpis: dashboard.executive_kpis,
        };
        const format = url.searchParams.get("format");
        if (format === "csv") {
          const rows = [
            "metric,value_cents",
            `revenue,${dashboard.profit.customer_revenue_cents}`,
            `cleaner_payouts,${dashboard.profit.cleaner_payouts_cents}`,
            `operating_expenses,${dashboard.profit.operating_expenses_cents}`,
            `net_profit,${dashboard.profit.net_profit_cents}`,
          ].join("\n");
          return new Response(rows, {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="${reportType}-${f}-${t}.csv"`,
            },
          });
        }
        return NextResponse.json(payload);
      }
      default:
        return NextResponse.json({ error: "Unknown report type." }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
