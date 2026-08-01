import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadOfficePayoutPeriodReport } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";
import { loadReferralPromoCostTotals } from "@/lib/admin/referrals/loadReferralPromoCosts";
import { computeProfitBreakdown } from "@/lib/admin/expenses/profitCalculations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONTH_RE = /^\d{4}-\d{2}$/;
const PAGE_SIZE = 1_000;

type RecurringBookingRow = {
  id: string;
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

function isValidMonth(month: string): boolean {
  if (!MONTH_RE.test(month)) return false;
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber >= 1 && monthNumber <= 12;
}

function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: lastDay };
}

function johannesburgMonthBounds(month: string): { fromUtc: string; nextMonthUtc: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const offsetMs = 2 * 60 * 60 * 1_000;
  return {
    fromUtc: new Date(Date.UTC(year, monthNumber - 1, 1) - offsetMs).toISOString(),
    nextMonthUtc: new Date(Date.UTC(year, monthNumber, 1) - offsetMs).toISOString(),
  };
}

async function fetchBookingRows(
  admin: SupabaseClient,
  options: { from?: string; to: string; completedOnly?: boolean },
): Promise<RecurringBookingRow[]> {
  const rows: RecurringBookingRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = admin
      .from("bookings")
      .select("id,status,booking_type,recurring_id,is_recurring_generated,customer_id,customer_email,date")
      .eq("is_test", false)
      .lte("date", options.to)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (options.from) query = query.gte("date", options.from);
    if (options.completedOnly) query = query.eq("status", "completed");

    const { data, error } = await query;
    if (error) throw error;

    const page = (data ?? []) as RecurringBookingRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
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
  if (!isValidMonth(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format with a month from 01 to 12" }, { status: 400 });
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
  const { fromUtc, nextMonthUtc } = johannesburgMonthBounds(month);

  try {
    const [payoutReport, operatingExpenses, promoCosts, bookingRows, recurringHistoryRows, reviews, applications] =
      await Promise.all([
        loadOfficePayoutPeriodReport(admin, from, to),
        sumApprovedExpensesInRange(admin, from, to),
        loadReferralPromoCostTotals(admin, from, to),
        fetchBookingRows(admin, { from, to }),
        fetchBookingRows(admin, { to, completedOnly: true }),
        admin
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .gte("created_at", fromUtc)
          .lt("created_at", nextMonthUtc),
        admin.from("cleaner_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

    if (reviews.error || applications.error) {
      throw reviews.error ?? applications.error;
    }

    const profit = computeProfitBreakdown(
      payoutReport.totals.total_revenue_cents,
      payoutReport.totals.earned_cents,
      operatingExpenses,
      promoCosts.referral_discount_cost_cents,
      promoCosts.cleaning_credit_cost_cents,
    );

    const completed = bookingRows.filter((row) => row.status === "completed").length;
    const cancelled = bookingRows.filter((row) => row.status === "cancelled").length;
    const scheduled = completed + cancelled;
    const recurringBookings = bookingRows.filter((row) => row.status === "completed" && isRecurring(row)).length;

    const firstRecurringDateByCustomer = new Map<string, string>();
    for (const row of recurringHistoryRows) {
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
