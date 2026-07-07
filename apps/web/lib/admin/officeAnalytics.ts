import { calendarDateYmdInTimeZone } from "@/lib/admin/metrics";
import { bookingCustomerKey } from "@/lib/booking/bookingCustomerIdentity";
import {
  adminDashboardRevenueCents,
  isAdminDashboardRevenueEligible,
  type AdminDashboardRevenueRow,
} from "@/lib/admin/dashboardRevenue";
import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";

export const OFFICE_ANALYTICS_TIMEZONE = "Africa/Johannesburg";

/** Legacy quick-select presets (kept for backward compatibility). */
export type OfficeAnalyticsPeriod = "7d" | "30d" | "90d";

/** Half-open analytics window `[startMs, endMs)` in epoch milliseconds. */
export type OfficeAnalyticsWindow = { startMs: number; endMs: number };

/** Bucket granularity used for the revenue chart, chosen from the window length. */
export type OfficeAnalyticsGranularity = "day" | "week" | "month";

/** Default range applied when no explicit `from`/`to` is provided. */
export const DEFAULT_ANALYTICS_RANGE_DAYS = 30;

/** Guard against pathological queries — the widest range we will compute. */
export const MAX_ANALYTICS_RANGE_DAYS = 366;

export type OfficeAnalyticsBookingRow = AdminDashboardRevenueRow & {
  created_at?: string | null;
  updated_at?: string | null;
  service?: string | null;
  service_slug?: string | null;
  /** Production bookings use `customer_id`; legacy schemas may still expose `user_id`. */
  customer_id?: string | null;
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

export type OfficeAnalyticsRange = {
  /** Inclusive first calendar day of the window (`yyyy-MM-dd`, JHB). */
  fromYmd: string;
  /** Inclusive last calendar day of the window (`yyyy-MM-dd`, JHB). */
  toYmd: string;
  /** Number of calendar days covered (inclusive). */
  days: number;
  /** Bucket granularity used for the revenue chart. */
  granularity: OfficeAnalyticsGranularity;
};

export type OfficeAnalyticsSummary = {
  fetchedAt: string;
  timezone: string;
  range: OfficeAnalyticsRange;
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
  /** Revenue points for the selected window, bucketed by `range.granularity`. */
  revenueChart: OfficeAnalyticsChartPoint[];
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

function daysBetweenYmd(startYmd: string, endYmd: string): number {
  const a = Date.parse(`${startYmd}T00:00:00.000Z`);
  const b = Date.parse(`${endYmd}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

function ymdInTz(ms: number): string {
  return calendarDateYmdInTimeZone(new Date(ms), OFFICE_ANALYTICS_TIMEZONE);
}

function dayOfMonthLabel(ymd: string): string {
  return String(Number(ymd.slice(8, 10)));
}

function weekdayShortLabel(ymd: string): string {
  const weekday = new Date(`${ymd}T12:00:00+02:00`).getDay();
  return WEEKDAY_SHORT[Number.isFinite(weekday) ? weekday : 0] ?? ymd.slice(5);
}

function pickGranularity(days: number): OfficeAnalyticsGranularity {
  if (days <= 14) return "day";
  if (days <= 70) return "week";
  return "month";
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
    const uid = bookingCustomerKey(row);
    if (!uid) continue;
    if (customersInWindow.has(uid)) continue;
    customersInWindow.add(uid);
    if (priorCustomerIds.has(uid)) returning++;
  }

  if (customersInWindow.size === 0) return null;
  return Math.round((returning / customersInWindow.size) * 1000) / 10;
}

/**
 * Sum eligible paid revenue (ZAR) per calendar day (JHB) inside the inclusive
 * `[startYmd, endYmd]` range. Days without revenue are omitted from the map.
 */
function revenueByDayInRange(
  rows: OfficeAnalyticsBookingRow[],
  startYmd: string,
  endYmd: string,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (!isAdminDashboardRevenueEligible(row)) continue;
    const paidAt = row.payment_completed_at ? new Date(row.payment_completed_at) : null;
    if (!paidAt || !Number.isFinite(paidAt.getTime())) continue;
    const day = calendarDateYmdInTimeZone(paidAt, OFFICE_ANALYTICS_TIMEZONE);
    if (day < startYmd || day > endYmd) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + paidRevenueZar(row));
  }
  return byDay;
}

/**
 * Build the revenue chart for an arbitrary window, choosing daily / weekly /
 * monthly buckets based on the window length so the chart stays readable.
 */
function buildRevenueChartForRange(
  rows: OfficeAnalyticsBookingRow[],
  startYmd: string,
  endYmd: string,
  granularity: OfficeAnalyticsGranularity,
): OfficeAnalyticsChartPoint[] {
  const byDay = revenueByDayInRange(rows, startYmd, endYmd);
  const totalDays = daysBetweenYmd(startYmd, endYmd) + 1;

  if (granularity === "day") {
    const points: OfficeAnalyticsChartPoint[] = [];
    for (let i = 0; i < totalDays; i++) {
      const ymd = addDaysYmd(startYmd, i);
      const label = totalDays <= 8 ? weekdayShortLabel(ymd) : dayOfMonthLabel(ymd);
      points.push({ label, value: byDay.get(ymd) ?? 0 });
    }
    return points;
  }

  if (granularity === "week") {
    const numWeeks = Math.ceil(totalDays / 7);
    const points: OfficeAnalyticsChartPoint[] = [];
    for (let w = 0; w < numWeeks; w++) {
      let value = 0;
      for (let d = w * 7; d < Math.min((w + 1) * 7, totalDays); d++) {
        value += byDay.get(addDaysYmd(startYmd, d)) ?? 0;
      }
      points.push({ label: `W${w + 1}`, value });
    }
    return points;
  }

  // Monthly buckets spanning the calendar months the range touches.
  const points: OfficeAnalyticsChartPoint[] = [];
  let cursor = monthStartYmd(startYmd);
  const endMonthStart = monthStartYmd(endYmd);
  while (cursor <= endMonthStart) {
    const nextMonthStart = monthStartYmd(addDaysYmd(`${cursor.slice(0, 7)}-28`, 7));
    let value = 0;
    for (const [ymd, revenue] of byDay.entries()) {
      if (ymd >= cursor && ymd < nextMonthStart) value += revenue;
    }
    points.push({ label: monthLabel(cursor), value });
    cursor = nextMonthStart;
  }
  return points;
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

/** Default analytics window: the last {@link DEFAULT_ANALYTICS_RANGE_DAYS} days ending now. */
export function defaultOfficeAnalyticsWindow(now = new Date()): OfficeAnalyticsWindow {
  const endMs = now.getTime();
  return { startMs: endMs - DEFAULT_ANALYTICS_RANGE_DAYS * 86_400_000, endMs };
}

export function computeOfficeAnalyticsSummary(
  rows: OfficeAnalyticsBookingRow[],
  priorCustomerIds: Iterable<string>,
  now = new Date(),
  window: OfficeAnalyticsWindow = defaultOfficeAnalyticsWindow(now),
): OfficeAnalyticsSummary {
  const startMs = window.startMs;
  const endMs = window.endMs;
  const windowLenMs = Math.max(endMs - startMs, 0);
  // Trend comparisons use the equal-length window immediately preceding this one.
  const prevStartMs = startMs - windowLenMs;
  const prevEndMs = startMs;
  const priorIds = new Set(
    [...priorCustomerIds].map((id) => id.trim()).filter((id) => id.length > 0),
  );

  const totalRevenueZar = sumPaidRevenue(rows, startMs, endMs);
  const prevRevenueZar = sumPaidRevenue(rows, prevStartMs, prevEndMs);
  const totalBookings = countPaidBookings(rows, startMs, endMs);
  const prevBookings = countPaidBookings(rows, prevStartMs, prevEndMs);
  const avgBookingValueZar = totalBookings > 0 ? Math.round(totalRevenueZar / totalBookings) : 0;
  const prevAvg =
    prevBookings > 0 ? Math.round(prevRevenueZar / prevBookings) : 0;

  const retentionNow = retentionPct(rows, startMs, endMs, priorIds);
  const retentionPrev = retentionPct(rows, prevStartMs, prevEndMs, priorIds);

  const countCreated = (fromMs: number, toMs: number) =>
    rows.filter((row) => inHalfOpenWindow(row.created_at, fromMs, toMs)).length;

  const countRecurring = (fromMs: number, toMs: number) =>
    rows.filter(
      (row) =>
        row.is_recurring_generated === true && inHalfOpenWindow(row.created_at, fromMs, toMs),
    ).length;

  const countCancelled = (fromMs: number, toMs: number) =>
    rows.filter((row) => isCancelledInWindow(row, fromMs, toMs)).length;

  const countRefunds = (fromMs: number, toMs: number) =>
    rows.filter((row) => isRefundInWindow(row, fromMs, toMs)).length;

  const trendRow = (label: string, value: number, prev: number): OfficeAnalyticsTrendRow => ({
    label,
    value,
    prev,
    trendPct: pctChange(value, prev),
  });

  const fromYmd = ymdInTz(startMs);
  const toYmd = ymdInTz(Math.max(endMs - 1, startMs));
  const days = daysBetweenYmd(fromYmd, toYmd) + 1;
  const granularity = pickGranularity(days);

  return {
    fetchedAt: now.toISOString(),
    timezone: OFFICE_ANALYTICS_TIMEZONE,
    range: { fromYmd, toYmd, days, granularity },
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
    revenueChart: buildRevenueChartForRange(rows, fromYmd, toYmd, granularity),
    servicePopularity: buildServicePopularity(rows, startMs, endMs),
    bookingTrends: [
      trendRow("New bookings", countCreated(startMs, endMs), countCreated(prevStartMs, prevEndMs)),
      trendRow("Recurring visits", countRecurring(startMs, endMs), countRecurring(prevStartMs, prevEndMs)),
      trendRow("Cancellations", countCancelled(startMs, endMs), countCancelled(prevStartMs, prevEndMs)),
      trendRow("Refunds", countRefunds(startMs, endMs), countRefunds(prevStartMs, prevEndMs)),
    ],
  };
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Convert a JHB calendar day (`yyyy-MM-dd`) to the epoch ms of its 00:00 boundary. */
function jhbDayStartMs(ymd: string): number | null {
  if (!YMD_RE.test(ymd)) return null;
  const ms = Date.parse(`${ymd}T00:00:00+02:00`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve an analytics window from optional `from`/`to` calendar-day params
 * (JHB). Invalid or missing params fall back to the default 30-day window; the
 * range is clamped to {@link MAX_ANALYTICS_RANGE_DAYS} and ordered ascending.
 */
export function officeAnalyticsWindowFromParams(
  fromYmd: string | null | undefined,
  toYmd: string | null | undefined,
  now = new Date(),
): OfficeAnalyticsWindow {
  const fromMs = fromYmd ? jhbDayStartMs(fromYmd) : null;
  const toMs = toYmd ? jhbDayStartMs(toYmd) : null;
  if (fromMs == null || toMs == null) return defaultOfficeAnalyticsWindow(now);

  let startMs = Math.min(fromMs, toMs);
  // `to` is an inclusive day, so the half-open window ends at the next midnight.
  const endMs = Math.max(fromMs, toMs) + 86_400_000;
  const maxSpanMs = MAX_ANALYTICS_RANGE_DAYS * 86_400_000;
  if (endMs - startMs > maxSpanMs) startMs = endMs - maxSpanMs;
  return { startMs, endMs };
}

/**
 * Earliest instant we must fetch bookings from to satisfy a window: the window
 * start minus one window length (for the preceding trend-comparison window).
 */
export function officeAnalyticsFetchStartIso(window: OfficeAnalyticsWindow): string {
  const windowLenMs = Math.max(window.endMs - window.startMs, 0);
  return new Date(window.startMs - windowLenMs).toISOString();
}

/** Prior-customer lookup covers every successful payment before the window start. */
export function priorCustomerQueryEndIso(window: OfficeAnalyticsWindow): string {
  return new Date(window.startMs).toISOString();
}

export function extractPriorCustomerIds(
  rows: Array<{
    customer_id?: string | null;
    user_id?: string | null;
    payment_completed_at?: string | null;
    payment_status?: string | null;
  }>,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (norm(row.payment_status) !== "success") continue;
    if (!hasText(row.payment_completed_at)) continue;
    const uid = bookingCustomerKey(row);
    if (uid) ids.add(uid);
  }
  return [...ids];
}
