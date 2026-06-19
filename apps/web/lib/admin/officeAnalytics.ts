import { calendarDateYmdInTimeZone } from "@/lib/admin/metrics";
import {
  adminDashboardRevenueCents,
  isAdminDashboardRevenueEligible,
  type AdminDashboardRevenueRow,
} from "@/lib/admin/dashboardRevenue";
import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";

export const OFFICE_ANALYTICS_TIMEZONE = "Africa/Johannesburg";

export type OfficeAnalyticsPeriod = "7d" | "30d" | "90d";

export type OfficeAnalyticsBookingRow = AdminDashboardRevenueRow & {
  created_at?: string | null;
  updated_at?: string | null;
  service?: string | null;
  service_slug?: string | null;
  user_id?: string | null;
  is_recurring_generated?: boolean | null;
};

export type OfficeAnalyticsChartPoint = { label: string; value: number };

export type OfficeAnalyticsServiceRow = { name: string; count: number; pct: number };

export type OfficeAnalyticsTrendRow = {
  label: string;
  value: number;
  prev: number;
  trendPct: number | null;
};

export type OfficeAnalyticsSummary = {
  fetchedAt: string;
  timezone: string;
  kpis: {
    totalRevenueZar: number;
    totalRevenueTrendPct: number | null;
    totalBookings: number;
    totalBookingsTrendPct: number | null;
    avgBookingValueZar: number;
    avgBookingValueTrendPct: number | null;
    customerRetentionPct: number | null;
    customerRetentionTrendPct: number | null;
  };
  revenueChart: Record<OfficeAnalyticsPeriod, OfficeAnalyticsChartPoint[]>;
  servicePopularity: OfficeAnalyticsServiceRow[];
  bookingTrends: OfficeAnalyticsTrendRow[];
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const REFUND_STATUSES = new Set(["refunded", "full", "partial", "chargeback", "reversed"]);

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function inHalfOpenWindow(iso: string | null | undefined, startMs: number, endMs: number): boolean {
  const t = parseTime(iso);
  return t != null && t >= startMs && t < endMs;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function monthLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  return d.toLocaleString("en-ZA", { month: "short", timeZone: "UTC" });
}

export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function paidRevenueZar(row: OfficeAnalyticsBookingRow): number {
  return Math.round(adminDashboardRevenueCents(row) / 100);
}

function isRefundInWindow(row: OfficeAnalyticsBookingRow, startMs: number, endMs: number): boolean {
  if (inHalfOpenWindow(row.refunded_at, startMs, endMs)) return true;
  if (!REFUND_STATUSES.has(norm(row.refund_status))) return false;
  return inHalfOpenWindow(row.payment_completed_at, startMs, endMs) || inHalfOpenWindow(row.created_at, startMs, endMs);
}

function isCancelledInWindow(row: OfficeAnalyticsBookingRow, startMs: number, endMs: number): boolean {
  if (norm(row.status) !== "cancelled") return false;
  const anchor = row.updated_at ?? row.created_at;
  return inHalfOpenWindow(anchor, startMs, endMs);
}

function retentionPct(
  rows: OfficeAnalyticsBookingRow[],
  windowStartMs: number,
  windowEndMs: number,
  priorCustomerIds: Set<string>,
): number | null {
  const customersInWindow = new Set<string>();
  let returning = 0;

  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    const paidAt = parseTime(row.payment_completed_at);
    if (paidAt == null || paidAt < windowStartMs || paidAt >= windowEndMs) continue;
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid) continue;
    if (customersInWindow.has(uid)) continue;
    customersInWindow.add(uid);
    if (priorCustomerIds.has(uid)) returning++;
  }

  if (customersInWindow.size === 0) return null;
  return Math.round((returning / customersInWindow.size) * 1000) / 10;
}

function buildRevenueChart7d(
  rows: OfficeAnalyticsBookingRow[],
  now: Date,
): OfficeAnalyticsChartPoint[] {
  const todayYmd = calendarDateYmdInTimeZone(now, OFFICE_ANALYTICS_TIMEZONE);
  const buckets = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    buckets.set(addDaysYmd(todayYmd, -i), 0);
  }

  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    const paidAt = row.payment_completed_at ? new Date(row.payment_completed_at) : null;
    if (!paidAt || !Number.isFinite(paidAt.getTime())) continue;
    const day = calendarDateYmdInTimeZone(paidAt, OFFICE_ANALYTICS_TIMEZONE);
    if (!buckets.has(day)) continue;
    buckets.set(day, (buckets.get(day) ?? 0) + paidRevenueZar(row));
  }

  return [...buckets.entries()].map(([ymd, value]) => {
    const weekday = new Date(`${ymd}T12:00:00+02:00`).getDay();
    const label = WEEKDAY_SHORT[Number.isFinite(weekday) ? weekday : 0] ?? ymd.slice(5);
    return { label, value };
  });
}

function buildRevenueChart30d(rows: OfficeAnalyticsBookingRow[], now: Date): OfficeAnalyticsChartPoint[] {
  const todayYmd = calendarDateYmdInTimeZone(now, OFFICE_ANALYTICS_TIMEZONE);
  const weekStarts: string[] = [];
  for (let w = 3; w >= 0; w--) {
    weekStarts.push(addDaysYmd(todayYmd, -(w * 7 + 6)));
  }
  const buckets = weekStarts.map((startYmd, index) => ({
    label: `W${index + 1}`,
    startYmd,
    endYmd: addDaysYmd(startYmd, 7),
    value: 0,
  }));

  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    const paidAt = row.payment_completed_at ? new Date(row.payment_completed_at) : null;
    if (!paidAt || !Number.isFinite(paidAt.getTime())) continue;
    const day = calendarDateYmdInTimeZone(paidAt, OFFICE_ANALYTICS_TIMEZONE);
    for (const bucket of buckets) {
      if (day >= bucket.startYmd && day < bucket.endYmd) {
        bucket.value += paidRevenueZar(row);
        break;
      }
    }
  }

  return buckets.map(({ label, value }) => ({ label, value }));
}

function buildRevenueChart90d(rows: OfficeAnalyticsBookingRow[], now: Date): OfficeAnalyticsChartPoint[] {
  const todayYmd = calendarDateYmdInTimeZone(now, OFFICE_ANALYTICS_TIMEZONE);
  const monthStarts: string[] = [];
  let cursor = monthStartYmd(todayYmd);
  for (let i = 0; i < 3; i++) {
    monthStarts.unshift(cursor);
    const prevMonthEnd = addDaysYmd(cursor, -1);
    cursor = monthStartYmd(prevMonthEnd);
  }

  const buckets = monthStarts.map((startYmd, index) => {
    const nextStart =
      index < monthStarts.length - 1 ? monthStarts[index + 1]! : addDaysYmd(todayYmd, 1);
    return { label: monthLabel(startYmd), startYmd, endYmd: nextStart, value: 0 };
  });

  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    const paidAt = row.payment_completed_at ? new Date(row.payment_completed_at) : null;
    if (!paidAt || !Number.isFinite(paidAt.getTime())) continue;
    const day = calendarDateYmdInTimeZone(paidAt, OFFICE_ANALYTICS_TIMEZONE);
    for (const bucket of buckets) {
      if (day >= bucket.startYmd && day < bucket.endYmd) {
        bucket.value += paidRevenueZar(row);
        break;
      }
    }
  }

  return buckets.map(({ label, value }) => ({ label, value }));
}

function buildServicePopularity(rows: OfficeAnalyticsBookingRow[], startMs: number, endMs: number): OfficeAnalyticsServiceRow[] {
  const counts = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    if (!inHalfOpenWindow(row.payment_completed_at, startMs, endMs)) continue;
    const name =
      serviceLabelFromBookingRow({
        service: row.service ?? null,
        service_slug: row.service_slug ?? null,
      }) ?? "Other";
    counts.set(name, (counts.get(name) ?? 0) + 1);
    total++;
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

function countPaidBookings(rows: OfficeAnalyticsBookingRow[], startMs: number, endMs: number): number {
  let count = 0;
  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    if (inHalfOpenWindow(row.payment_completed_at, startMs, endMs)) count++;
  }
  return count;
}

function sumPaidRevenue(rows: OfficeAnalyticsBookingRow[], startMs: number, endMs: number): number {
  let total = 0;
  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    if (inHalfOpenWindow(row.payment_completed_at, startMs, endMs)) total += paidRevenueZar(row);
  }
  return total;
}

export function computeOfficeAnalyticsSummary(
  rows: OfficeAnalyticsBookingRow[],
  priorCustomerIds: Iterable<string>,
  now = new Date(),
): OfficeAnalyticsSummary {
  const endMs = now.getTime();
  const window30StartMs = endMs - 30 * 86_400_000;
  const prev30StartMs = endMs - 60 * 86_400_000;
  const priorIds = new Set(
    [...priorCustomerIds].map((id) => id.trim()).filter((id) => id.length > 0),
  );

  const totalRevenueZar = sumPaidRevenue(rows, window30StartMs, endMs);
  const prevRevenueZar = sumPaidRevenue(rows, prev30StartMs, window30StartMs);
  const totalBookings = countPaidBookings(rows, window30StartMs, endMs);
  const prevBookings = countPaidBookings(rows, prev30StartMs, window30StartMs);
  const avgBookingValueZar = totalBookings > 0 ? Math.round(totalRevenueZar / totalBookings) : 0;
  const prevAvg =
    prevBookings > 0 ? Math.round(prevRevenueZar / prevBookings) : 0;

  const retentionNow = retentionPct(rows, window30StartMs, endMs, priorIds);
  const retentionPrev = retentionPct(rows, prev30StartMs, window30StartMs, priorIds);

  const countCreated = (startMs: number, endMs: number) =>
    rows.filter((row) => inHalfOpenWindow(row.created_at, startMs, endMs)).length;

  const countRecurring = (startMs: number, endMs: number) =>
    rows.filter(
      (row) =>
        row.is_recurring_generated === true && inHalfOpenWindow(row.created_at, startMs, endMs),
    ).length;

  const countCancelled = (startMs: number, endMs: number) =>
    rows.filter((row) => isCancelledInWindow(row, startMs, endMs)).length;

  const countRefunds = (startMs: number, endMs: number) =>
    rows.filter((row) => isRefundInWindow(row, startMs, endMs)).length;

  const trendRow = (label: string, value: number, prev: number): OfficeAnalyticsTrendRow => ({
    label,
    value,
    prev,
    trendPct: pctChange(value, prev),
  });

  return {
    fetchedAt: now.toISOString(),
    timezone: OFFICE_ANALYTICS_TIMEZONE,
    kpis: {
      totalRevenueZar,
      totalRevenueTrendPct: pctChange(totalRevenueZar, prevRevenueZar),
      totalBookings,
      totalBookingsTrendPct: pctChange(totalBookings, prevBookings),
      avgBookingValueZar,
      avgBookingValueTrendPct: pctChange(avgBookingValueZar, prevAvg),
      customerRetentionPct: retentionNow,
      customerRetentionTrendPct:
        retentionNow != null && retentionPrev != null ? pctChange(retentionNow, retentionPrev) : null,
    },
    revenueChart: {
      "7d": buildRevenueChart7d(rows, now),
      "30d": buildRevenueChart30d(rows, now),
      "90d": buildRevenueChart90d(rows, now),
    },
    servicePopularity: buildServicePopularity(rows, window30StartMs, endMs),
    bookingTrends: [
      trendRow("New bookings", countCreated(window30StartMs, endMs), countCreated(prev30StartMs, window30StartMs)),
      trendRow(
        "Recurring visits",
        countRecurring(window30StartMs, endMs),
        countRecurring(prev30StartMs, window30StartMs),
      ),
      trendRow(
        "Cancellations",
        countCancelled(window30StartMs, endMs),
        countCancelled(prev30StartMs, window30StartMs),
      ),
      trendRow("Refunds", countRefunds(window30StartMs, endMs), countRefunds(prev30StartMs, window30StartMs)),
    ],
  };
}

export function officeAnalyticsQueryStartIso(now = new Date()): string {
  return new Date(now.getTime() - 90 * 86_400_000).toISOString();
}

export function priorCustomerQueryEndIso(now = new Date()): string {
  return new Date(now.getTime() - 30 * 86_400_000).toISOString();
}

export function extractPriorCustomerIds(
  rows: Array<{ user_id?: string | null; payment_completed_at?: string | null; payment_status?: string | null }>,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (norm(row.payment_status) !== "success") continue;
    if (!hasText(row.payment_completed_at)) continue;
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (uid) ids.add(uid);
  }
  return [...ids];
}
