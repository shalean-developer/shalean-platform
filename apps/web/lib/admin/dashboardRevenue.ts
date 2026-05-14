import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateYmdInTimeZone, johannesburgDayUtcBounds } from "@/lib/admin/metrics";

export const ADMIN_DASHBOARD_REVENUE_SCOPE =
  "Booking-level customer payments only. Monthly invoice collections are excluded here; monthly invoice child bookings are excluded to avoid double counting invoice collections.";

export type AdminDashboardRevenueRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  payment_completed_at: string | null;
  total_paid_zar: number | string | null;
  amount_paid_cents: number | string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
};

export type AdminDashboardRevenueSummary = {
  revenueTodayZar: number;
  revenueMonthZar: number;
  paidBookingsToday: number;
  paidBookingsMonth: number;
  totalPaidBookingsWindow: number;
  avgBookingValueZar: number;
  revenueByDay: { date: string; revenue: number }[];
  bookingsByDay: { date: string; count: number }[];
  windowStartIso: string;
  monthStartIso: string;
  todayStartIso: string;
  todayEndExclusiveIso: string;
  scope: string;
};

const TERMINAL_EXCLUDED_STATUSES = new Set(["cancelled", "failed", "payment_expired"]);
const REFUND_EXCLUDED_STATUSES = new Set([
  "refunded",
  "full",
  "partial",
  "chargeback",
  "reversed",
  "failed_after_success",
]);
const MONTHLY_CHILD_BILLING_TYPES = new Set(["recurring_invoice", "monthly_contract"]);

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

export function adminDashboardRevenueCents(row: AdminDashboardRevenueRow): number {
  const cents = Number(row.amount_paid_cents);
  if (Number.isFinite(cents) && cents > 0) return Math.round(cents);
  const zar = Number(row.total_paid_zar);
  if (Number.isFinite(zar) && zar > 0) return Math.round(zar * 100);
  return 0;
}

export function isAdminDashboardRevenueEligible(row: AdminDashboardRevenueRow): boolean {
  if (norm(row.payment_status) !== "success") return false;
  if (!hasText(row.payment_completed_at)) return false;
  if (TERMINAL_EXCLUDED_STATUSES.has(norm(row.status))) return false;
  if (hasText(row.refunded_at)) return false;
  if (REFUND_EXCLUDED_STATUSES.has(norm(row.refund_status))) return false;
  if (hasText(row.monthly_invoice_id)) return false;
  if (row.is_monthly_billing_booking === true) return false;
  if (MONTHLY_CHILD_BILLING_TYPES.has(norm(row.billing_type))) return false;
  return adminDashboardRevenueCents(row) > 0;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStartYmdJohannesburg(now: Date): string {
  return `${calendarDateYmdInTimeZone(now, "Africa/Johannesburg").slice(0, 7)}-01`;
}

function minIso(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

export function computeAdminDashboardRevenueSummary(
  rows: AdminDashboardRevenueRow[],
  now = new Date(),
): AdminDashboardRevenueSummary {
  const todayYmd = calendarDateYmdInTimeZone(now, "Africa/Johannesburg");
  const { startIso: todayStartIso, endExclusiveIso: todayEndExclusiveIso } = johannesburgDayUtcBounds(todayYmd);
  const monthStartIso = johannesburgDayUtcBounds(monthStartYmdJohannesburg(now)).startIso;
  const windowStartIso = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();

  const dayBuckets = new Map<string, { revenue: number; count: number }>();
  for (let i = 29; i >= 0; i--) {
    const ymd = addDaysYmd(todayYmd, -i);
    dayBuckets.set(ymd, { revenue: 0, count: 0 });
  }

  let revenueTodayCents = 0;
  let revenueMonthCents = 0;
  let paidBookingsToday = 0;
  let paidBookingsMonth = 0;
  let windowRevenueCents = 0;
  let totalPaidBookingsWindow = 0;

  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    const paidAt = row.payment_completed_at ? new Date(row.payment_completed_at) : null;
    if (!paidAt || !Number.isFinite(paidAt.getTime())) continue;
    const paidAtIso = paidAt.toISOString();
    const cents = adminDashboardRevenueCents(row);
    const day = calendarDateYmdInTimeZone(paidAt, "Africa/Johannesburg");

    if (paidAtIso >= todayStartIso && paidAtIso < todayEndExclusiveIso) {
      revenueTodayCents += cents;
      paidBookingsToday++;
    }
    if (paidAtIso >= monthStartIso) {
      revenueMonthCents += cents;
      paidBookingsMonth++;
    }
    if (paidAtIso >= windowStartIso && paidAtIso <= now.toISOString()) {
      windowRevenueCents += cents;
      totalPaidBookingsWindow++;
      const bucket = dayBuckets.get(day);
      if (bucket) {
        bucket.revenue += cents / 100;
        bucket.count += 1;
      }
    }
  }

  return {
    revenueTodayZar: Math.round(revenueTodayCents / 100),
    revenueMonthZar: Math.round(revenueMonthCents / 100),
    paidBookingsToday,
    paidBookingsMonth,
    totalPaidBookingsWindow,
    avgBookingValueZar:
      totalPaidBookingsWindow > 0 ? Math.round(windowRevenueCents / 100 / totalPaidBookingsWindow) : 0,
    revenueByDay: [...dayBuckets.entries()].map(([date, v]) => ({
      date,
      revenue: Math.round(v.revenue * 100) / 100,
    })),
    bookingsByDay: [...dayBuckets.entries()].map(([date, v]) => ({ date, count: v.count })),
    windowStartIso,
    monthStartIso,
    todayStartIso,
    todayEndExclusiveIso,
    scope: ADMIN_DASHBOARD_REVENUE_SCOPE,
  };
}

export function adminDashboardRevenueQueryStartIso(now = new Date()): string {
  const windowStartIso = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
  const monthStartIso = johannesburgDayUtcBounds(monthStartYmdJohannesburg(now)).startIso;
  return minIso(windowStartIso, monthStartIso);
}

export async function fetchAdminDashboardRevenueSummary(
  admin: SupabaseClient,
  now = new Date(),
): Promise<AdminDashboardRevenueSummary> {
  const queryStartIso = adminDashboardRevenueQueryStartIso(now);
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id,status,payment_status,payment_completed_at,total_paid_zar,amount_paid_cents,refunded_at,refund_status,billing_type,is_monthly_billing_booking,monthly_invoice_id",
    )
    .eq("payment_status", "success")
    .not("payment_completed_at", "is", null)
    .gte("payment_completed_at", queryStartIso)
    .order("payment_completed_at", { ascending: false })
    .limit(15000);

  if (error) throw new Error(error.message);
  return computeAdminDashboardRevenueSummary((data ?? []) as AdminDashboardRevenueRow[], now);
}
