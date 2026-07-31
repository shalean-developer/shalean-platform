import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadFinancialDashboard } from "@/lib/admin/expenses/loadFinancialDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONTH_RE = /^\d{4}-\d{2}$/;

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
    const [finance, bookings, reviews, applications] = await Promise.all([
      loadFinancialDashboard(admin, from, to),
      admin
        .from("bookings")
        .select("status,booking_type,recurring_id,is_recurring_generated", { count: "exact" })
        .eq("is_test", false)
        .gte("date", from)
        .lte("date", to),
      admin
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false)
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`),
      admin.from("cleaner_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    if (bookings.error || reviews.error || applications.error) {
      throw bookings.error ?? reviews.error ?? applications.error;
    }

    const bookingRows = bookings.data ?? [];
    const completed = bookingRows.filter((row) => row.status === "completed").length;
    const cancelled = bookingRows.filter((row) => row.status === "cancelled").length;
    const scheduled = completed + cancelled;
    const recurringBookings = bookingRows.filter(
      (row) => row.status === "completed" && (row.booking_type === "recurring" || row.recurring_id || row.is_recurring_generated),
    ).length;

    const profit = finance.profit;
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
          { key: "recurring_bookings", label: "Recurring Bookings", value: recurringBookings, unit: "count", source: "bookings" },
          { key: "verified_reviews", label: "Verified Reviews", value: reviews.count ?? 0, unit: "count", source: "reviews" },
          { key: "pending_applications", label: "Pending Applications", value: applications.count ?? 0, unit: "count", source: "cleaner_applications" },
          { key: "cleaner_earnings", label: "Cleaner Earnings", value: profit.cleaner_payouts_cents / 100, unit: "ZAR", source: "Office source of truth" },
          { key: "approved_expenses", label: "Approved Expenses", value: profit.operating_expenses_cents / 100, unit: "ZAR", source: "Office source of truth" },
          { key: "net_profit", label: "Net Profit", value: netProfit, unit: "ZAR", source: "Office source of truth" },
        ],
      },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    console.error("management reporting endpoint failed", error);
    return NextResponse.json({ error: "Unable to generate management report" }, { status: 500 });
  }
}
