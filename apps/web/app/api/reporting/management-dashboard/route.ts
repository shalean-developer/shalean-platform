import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadOfficePayoutPeriodReport } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";
import { loadReferralPromoCostTotals } from "@/lib/admin/referrals/loadReferralPromoCosts";
import { computeProfitBreakdown } from "@/lib/admin/expenses/profitCalculations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONTH_RE = /^\d{4}-\d{2}$/;

type RecurringBookingRow = {
  customer_id: string | null;
  customer_email: string | null;
  date: string | null;
  status: string | null;
  booking_type: string | null;
  recurring_id: string | null;
  is_recurring_generated: boolean | null;
};

function tokenMatches(provided: string, configured: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: lastDay };
}

function isRecurring(row: RecurringBookingRow): boolean {
  return row.booking_type === "recurring" || Boolean(row.recurring_id) || Boolean(row.is_recurring_generated);
}

function customerKey(row: RecurringBookingRow): string | null {
  if (row.customer_id) return `id:${row.customer_id}`;
  if (row.customer_email) return `email:${row.customer_email.trim().toLowerCase()}`;
  return null;
}

export async function GET(request: NextRequest) {
  const configuredToken = process.env.MANAGEMENT_REPORTING_TOKEN ?? "";
  const providedToken = request.headers.get("x-reporting-token") ?? "";
  if (!configuredToken || !providedToken || !tokenMatches(providedToken, configuredToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Reporting service is not configured" }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { from, to } = monthRange(month);

  try {
    const [payoutReport, operatingExpenses, promoCosts, bookings, recurringHistory, reviews, applications] = await Promise.all([
      loadOfficePayoutPeriodReport(admin, from, to),
      sumApprovedExpensesInRange(admin, from, to),
      loadReferralPromoCostTotals(admin, from, to),
      admin
        .from("bookings")
        .select("status,booking_type,recurring_id,is_recurring_generated,customer_id,customer_email,date")
        .eq("is_test", false)
        .gte("date", from)
        .lte("date", to),
      admin
        .from("bookings")
        .select("status,booking_type,recurring_id,is_recurring_generated,customer_id,customer_email,date")
        .eq("is_test", false)
        .eq("status", "completed")
        .lte("date", to),
      admin
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false)
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`),
      admin.from("cleaner_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    if (bookings.error || recurringHistory.error || reviews.error || applications.error) {
      throw bookings.error ?? recurringHistory.error ?? reviews.error ?? applications.error;
    }

    const profit = computeProfitBreakdown(
      payoutReport.totals.total_revenue_cents,
      payoutReport.totals.earned_cents,
      operatingExpenses,
      promoCosts.referral_discount_cost_cents,
      promoCosts.cleaning_credit_cost_cents,
    );

    const bookingRows = (bookings.data ?? []) as RecurringBookingRow[];
    const completed = bookingRows.filter((row) => row.status === "completed").length;
    const cancelled = bookingRows.filter((row) => row.status === "cancelled").length;
    const scheduled = completed + cancelled;
    const recurringBookings = bookingRows.filter((row) => row.status === "completed" && isRecurring(row)).length;

    const firstRecurringDateByCustomer = new Map<string, string>();
    for (const row of (recurringHistory.data ?? []) as RecurringBookingRow[]) {
      if (!row.date || !isRecurring(row)) continue;
      const key = customerKey(row);
      if (!key) continue;
      const previous = firstRecurringDateByCustomer.get(key);
      if (!previous || row.date < previous) firstRecurringDateByCustomer.set(key, row.date);
    }
    const newRecurringCustomers = [...firstRecurringDateByCustomer.values()].filter(
      (firstRecurringDate) => firstRecurringDate >= from && firstRecurringDate <= to,
    ).length;

    const revenue = profit.customer_revenue_cents / 100;
    const netProfit = profit.net_profit_after_promo_cents / 100;

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        reporting_period: { month, from, to },
        metrics: [
          { key: "revenue", label: "Revenue", value: revenue, unit: "ZAR", source: "Office source of truth" },
          { key: "completed_bookings", label: "Completed Bookings", value: completed, unit: "count", source: "bookings" },
          { key: "completion_rate", label: "Completion Rate", value: scheduled ? completed / scheduled : 0, unit: "ratio", source: "bookings" },
          { key: "cancellation_rate", label: "Cancellation Rate", value: scheduled ? cancelled / scheduled : 0, unit: "ratio", source: "bookings" },
          { key: "net_profit_margin", label: "Net Profit Margin", value: revenue ? netProfit / revenue : 0, unit: "ratio", source: "Office source of truth" },
          { key: "new_recurring_customers", label: "New Recurring Customers", value: newRecurringCustomers, unit: "count", source: "bookings" },
          { key: "verified_reviews", label: "Verified Reviews", value: reviews.count ?? 0, unit: "count", source: "reviews" },
          { key: "pending_applications", label: "Pending Applications", value: applications.count ?? 0, unit: "count", source: "cleaner_applications" },
          { key: "cleaner_earnings", label: "Cleaner Earnings", value: profit.cleaner_payouts_cents / 100, unit: "ZAR", source: "Office source of truth" },
          { key: "approved_expenses", label: "Approved Expenses", value: profit.operating_expenses_cents / 100, unit: "ZAR", source: "Office source of truth" },
          { key: "net_profit", label: "Net Profit", value: netProfit, unit: "ZAR", source: "Office source of truth" },
          { key: "recurring_bookings", label: "Recurring Bookings", value: recurringBookings, unit: "count", source: "bookings" },
        ],
      },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    console.error("management reporting endpoint failed", error);
    return NextResponse.json({ error: "Unable to generate management report" }, { status: 500 });
  }
}
