import { calendarDateYmdInTimeZone, DISPATCH_METRICS_UTILIZATION_TIMEZONE } from "@/lib/admin/metrics";
import {
  computeOfficeScheduleCleanerStats,
  type OfficeScheduleDayBooking,
  type OfficeScheduleDayCleaner,
} from "@/lib/admin/officeScheduleDayPresentation";
import { computeOfficeTodayScheduleStats, type OfficeScheduleBookingRow } from "@/lib/admin/officeTodayScheduleStats";
import { computeOpsSnapshotFromRows, getDispatchSlaBreachMinutes, type OpsSnapshot, type OpsSnapshotRow } from "@/lib/admin/opsSnapshot";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import { runProductionHealthScan } from "@/lib/observability/productionHealthMetrics";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OfficeOperationsIssue = {
  id: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  assigned: string;
  ageLabel: string;
};

export type OfficeSupplyDemandDay = {
  date: string;
  label: string;
  supply: number;
  demand: number;
};

export type OfficeOperationsSummary = {
  fetchedAt: string;
  kpis: {
    bookingsToday: number;
    openIssues: number;
    availableCleaners: number;
    /** Paid bookings without a cleaner assignment (ops queue). */
    unassignedPaid: number;
  };
  issues: OfficeOperationsIssue[];
  supplyDemand: OfficeSupplyDemandDay[];
};

const OPEN_BOOKINGS_PAGE_SIZE = 1000;
const OPEN_BOOKINGS_MAX_ROWS = 20_000;
const WEEK_BOOKINGS_PAGE_SIZE = 1000;
const WEEK_BOOKINGS_MAX_ROWS = 15_000;

const TERMINAL_DEMAND_STATUSES = new Set(["cancelled", "failed", "payment_expired"]);

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

/** Scheduled bookings that still count as demand (excludes cancelled / failed / payment_expired). */
export function countScheduledDemand(bookings: Pick<OfficeScheduleDayBooking, "status">[]): number {
  let demand = 0;
  for (const booking of bookings) {
    const status = String(booking.status ?? "").toLowerCase();
    if (TERMINAL_DEMAND_STATUSES.has(status)) continue;
    demand += 1;
  }
  return demand;
}

export function computeWeekSupplyDemand(
  cleaners: OfficeScheduleDayCleaner[],
  weekBookings: OfficeScheduleDayBooking[],
  todayYmd: string,
  days = 7,
): OfficeSupplyDemandDay[] {
  const bookingsByDate = new Map<string, OfficeScheduleDayBooking[]>();
  for (const booking of weekBookings) {
    const date = String(booking.date ?? "").slice(0, 10);
    if (!date) continue;
    if (!bookingsByDate.has(date)) bookingsByDate.set(date, []);
    bookingsByDate.get(date)!.push(booking);
  }

  const supplyDemand: OfficeSupplyDemandDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysYmd(todayYmd, i);
    const dayBookings = bookingsByDate.get(date) ?? [];
    const cleanerStats = computeOfficeScheduleCleanerStats({
      bookings: dayBookings,
      cleaners,
      dateYmd: date,
    });
    supplyDemand.push({
      date,
      label: formatDayLabel(date),
      supply: cleanerStats.availableIdle,
      demand: countScheduledDemand(dayBookings),
    });
  }
  return supplyDemand;
}

function issuesFromOpsSnapshot(snapshot: OpsSnapshot): OfficeOperationsIssue[] {
  const issues: OfficeOperationsIssue[] = [];
  if (snapshot.slaBreaches > 0) {
    issues.push({
      id: "sla-breaches",
      title: `${snapshot.slaBreaches} dispatch SLA breach${snapshot.slaBreaches === 1 ? "" : "es"} (>${getDispatchSlaBreachMinutes()}m unassigned)`,
      priority: snapshot.oldestBreachMinutes >= 30 ? "critical" : "high",
      assigned: "Dispatch",
      ageLabel: snapshot.oldestBreachMinutes > 0 ? `${snapshot.oldestBreachMinutes}m overdue` : "active",
    });
  }
  if (snapshot.unassigned > 0) {
    issues.push({
      id: "unassigned",
      title: `${snapshot.unassigned} paid booking${snapshot.unassigned === 1 ? "" : "s"} without cleaner`,
      priority: snapshot.unassigned >= 3 ? "high" : "medium",
      assigned: "Dispatch",
      ageLabel: "now",
    });
  }
  if (snapshot.startingSoon > 0) {
    const mins = snapshot.startingSoonNextMinutes;
    issues.push({
      id: "starting-soon",
      title: `${snapshot.startingSoon} job${snapshot.startingSoon === 1 ? "" : "s"} starting within 2h unassigned`,
      priority: mins != null && mins < 60 ? "critical" : "high",
      assigned: "Dispatch",
      ageLabel: mins != null ? `in ${mins}m` : "soon",
    });
  }
  if (snapshot.unassignable > 0) {
    issues.push({
      id: "unassignable",
      title: `${snapshot.unassignable} booking${snapshot.unassignable === 1 ? "" : "s"} marked unassignable`,
      priority: "medium",
      assigned: "Ops",
      ageLabel: "open",
    });
  }
  return issues;
}

const PRIORITY_RANK: Record<OfficeOperationsIssue["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

async function fetchPaginatedOpenBookingRows(admin: SupabaseClient): Promise<OpsSnapshotRow[]> {
  const select =
    "id,status,date,time,cleaner_id,team_id,dispatch_status,became_pending_at,created_at,total_paid_zar,amount_paid_cents";
  const rows: OpsSnapshotRow[] = [];

  for (let from = 0; from < OPEN_BOOKINGS_MAX_ROWS; from += OPEN_BOOKINGS_PAGE_SIZE) {
    const to = from + OPEN_BOOKINGS_PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("bookings")
      .select(select)
      .not("status", "in", "(completed,cancelled,failed)")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as OpsSnapshotRow[];
    rows.push(...batch);
    if (batch.length < OPEN_BOOKINGS_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchPaginatedWeekBookings(
  admin: SupabaseClient,
  startYmd: string,
  endYmd: string,
): Promise<OfficeScheduleDayBooking[]> {
  const select =
    "id, date, time, status, cleaner_id, selected_cleaner_id, team_id, is_team_job, dispatch_status";
  const rows: OfficeScheduleDayBooking[] = [];

  for (let from = 0; from < WEEK_BOOKINGS_MAX_ROWS; from += WEEK_BOOKINGS_PAGE_SIZE) {
    const to = from + WEEK_BOOKINGS_PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("bookings")
      .select(select)
      .gte("date", startYmd)
      .lte("date", endYmd)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as OfficeScheduleDayBooking[];
    rows.push(...batch);
    if (batch.length < WEEK_BOOKINGS_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchOfficeOperationsCleaners(admin: SupabaseClient): Promise<OfficeScheduleDayCleaner[]> {
  const withRoster = "id, full_name, phone, is_available, status, availability_weekdays";
  const base = "id, full_name, phone, is_available, status";

  let { data, error } = await admin.from("cleaners").select(withRoster).order("full_name", { ascending: true });
  if (error && isUnknownColumnError(error, "availability_weekdays")) {
    const fallback = await admin.from("cleaners").select(base).order("full_name", { ascending: true });
    data = (fallback.data ?? []).map((row) => ({ ...row, availability_weekdays: null }));
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  return (data ?? []) as OfficeScheduleDayCleaner[];
}

export async function loadOfficeOperationsSummary(admin: SupabaseClient): Promise<OfficeOperationsSummary> {
  const todayYmd = calendarDateYmdInTimeZone(new Date(), DISPATCH_METRICS_UTILIZATION_TIMEZONE);
  const weekEnd = addDaysYmd(todayYmd, 6);

  const [openRows, todayBookingsRes, weekBookings, cleaners, healthScan] = await Promise.all([
    fetchPaginatedOpenBookingRows(admin),
    admin
      .from("bookings")
      .select("status,cleaner_id,selected_cleaner_id,team_id,is_team_job")
      .eq("date", todayYmd)
      .limit(2000),
    fetchPaginatedWeekBookings(admin, todayYmd, weekEnd),
    fetchOfficeOperationsCleaners(admin),
    runProductionHealthScan(admin, { scanLimit: 1000 }),
  ]);

  const snapshot = computeOpsSnapshotFromRows(openRows);
  const todayStats = computeOfficeTodayScheduleStats((todayBookingsRes.data ?? []) as OfficeScheduleBookingRow[]);
  const supplyDemand = computeWeekSupplyDemand(cleaners, weekBookings, todayYmd);

  const issues = issuesFromOpsSnapshot(snapshot);
  for (const finding of healthScan.findings) {
    const sev = String(finding.severity ?? "").toLowerCase();
    const priority: OfficeOperationsIssue["priority"] =
      sev === "critical" ? "critical" : sev === "warning" ? "medium" : "low";
    issues.push({
      id: `health-${finding.code}`,
      title: finding.message,
      priority,
      assigned: "Tech",
      ageLabel: `${finding.count} in scan`,
    });
  }
  issues.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return {
    fetchedAt: new Date().toISOString(),
    kpis: {
      bookingsToday: todayStats.total,
      openIssues: issues.length,
      availableCleaners: supplyDemand[0]?.supply ?? 0,
      unassignedPaid: snapshot.unassigned,
    },
    issues,
    supplyDemand,
  };
}
