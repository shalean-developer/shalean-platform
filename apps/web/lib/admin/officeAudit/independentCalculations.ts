/**
 * Independently constructed Office dashboard calculations for the DB audit layer.
 *
 * Intentionally does NOT import dashboard aggregation helpers
 * (`computeOfficeTodayScheduleStats`, `computeOpsSnapshotFromRows`, etc.).
 * Rules are re-implemented from the discovered business requirements so the
 * DB layer can disagree with application helpers when those helpers drift.
 */

import {
  averageBookingValueZar,
  bookingStartUtcMs,
  johannesburgDayBounds,
  johannesburgYmd,
} from "@/lib/admin/officeAudit/parseValues";

export type IndependentBookingRow = {
  id?: string | null;
  date?: string | null;
  time?: string | null;
  status?: string | null;
  cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
  team_id?: string | null;
  dispatch_status?: string | null;
  became_pending_at?: string | null;
  created_at?: string | null;
  total_paid_zar?: number | string | null;
  amount_paid_cents?: number | string | null;
  total_price?: number | string | null;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
  is_recurring_generated?: boolean | null;
  recurring_id?: string | null;
  booking_cleaners?: readonly { cleaner_id?: string | null }[] | null;
};

export type IndependentCleanerRow = {
  id: string;
  is_available?: boolean | null;
  status?: string | null;
  is_active?: boolean | null;
  availability_weekdays?: unknown;
};

export type IndependentInvoiceRow = {
  balance_cents?: number | string | null;
  status?: string | null;
  is_overdue?: boolean | null;
};

const TERMINAL = new Set(["cancelled", "failed", "payment_expired"]);
const REFUND_EXCLUDED = new Set([
  "refunded",
  "full",
  "partial",
  "chargeback",
  "reversed",
  "failed_after_success",
]);
const MONTHLY_CHILD_BILLING = new Set(["recurring_invoice", "monthly_contract"]);

function norm(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function hasText(v: unknown): boolean {
  return typeof v === "string" ? v.trim().length > 0 : v != null && String(v).trim().length > 0;
}

function paidCents(row: IndependentBookingRow): number {
  const cents = Number(row.amount_paid_cents);
  if (Number.isFinite(cents) && cents > 0) return Math.round(cents);
  const zar = Number(row.total_paid_zar);
  if (Number.isFinite(zar) && zar > 0) return Math.round(zar * 100);
  return 0;
}

function pendingCents(row: IndependentBookingRow): number {
  const c = paidCents(row);
  if (c > 0) return c;
  const price = Number(row.total_price);
  if (Number.isFinite(price) && price > 0) return Math.round(price * 100);
  return 0;
}

function isMonthlyChild(row: IndependentBookingRow): boolean {
  if (hasText(row.monthly_invoice_id)) return true;
  if (row.is_monthly_billing_booking === true) return true;
  return MONTHLY_CHILD_BILLING.has(norm(row.billing_type));
}

export function independentRevenueEligible(row: IndependentBookingRow): boolean {
  if (norm(row.payment_status) !== "success") return false;
  if (!hasText(row.payment_completed_at)) return false;
  if (TERMINAL.has(norm(row.status))) return false;
  if (hasText(row.refunded_at)) return false;
  if (REFUND_EXCLUDED.has(norm(row.refund_status))) return false;
  if (isMonthlyChild(row)) return false;
  return paidCents(row) > 0;
}

function hasConfirmedAssignment(row: IndependentBookingRow): boolean {
  if (hasText(row.cleaner_id)) return true;
  if (hasText(row.team_id)) return true;
  if ((row.booking_cleaners ?? []).some((m) => hasText(m.cleaner_id))) return true;
  return false;
}

function hasOpsAssignment(row: IndependentBookingRow): boolean {
  return hasText(row.cleaner_id) || hasText(row.team_id);
}

function isRecurringOrMonthlyAssignable(row: IndependentBookingRow): boolean {
  if (row.is_recurring_generated === true) return true;
  if (row.is_monthly_billing_booking === true) return true;
  if (norm(row.billing_type) === "monthly") return true;
  if (hasText(row.monthly_invoice_id)) return true;
  if (hasText(row.recurring_id)) return true;
  const ps = norm(row.payment_status);
  return ps === "pending_monthly" || ps === "monthly";
}

function isPaidOps(row: IndependentBookingRow): boolean {
  if (typeof row.total_paid_zar === "number" && row.total_paid_zar > 0) return true;
  return Math.round((Number(row.amount_paid_cents) || 0) / 100) > 0;
}

export function independentScheduleStats(rows: IndependentBookingRow[]) {
  let completed = 0;
  let inProgress = 0;
  let upcoming = 0;
  let unassigned = 0;
  let cancelled = 0;
  for (const row of rows) {
    const st = norm(row.status);
    if (st === "completed") {
      completed += 1;
      continue;
    }
    if (TERMINAL.has(st)) {
      cancelled += 1;
      continue;
    }
    if (st === "in_progress" || st === "en_route") {
      inProgress += 1;
      continue;
    }
    if (hasConfirmedAssignment(row)) upcoming += 1;
    else unassigned += 1;
  }
  return {
    total: completed + inProgress + upcoming + unassigned,
    rawTotal: rows.length,
    completed,
    inProgress,
    upcoming,
    unassigned,
    cancelled,
  };
}

export function independentVisitPaidValueZar(rows: IndependentBookingRow[]): number {
  let cents = 0;
  for (const row of rows) {
    if (TERMINAL.has(norm(row.status))) continue;
    if (isMonthlyChild(row)) continue;
    if (!independentRevenueEligible(row)) continue;
    cents += paidCents(row);
  }
  return Math.round(cents / 100);
}

export function independentStatusLabel(row: IndependentBookingRow): string {
  const st = norm(row.status);
  if (st === "completed") return "done";
  if (st === "in_progress" || st === "en_route") return "in progress";
  if (TERMINAL.has(st)) return st.replace(/_/g, " ");
  if (!hasConfirmedAssignment(row)) {
    if (hasText(row.selected_cleaner_id)) return "preferred";
    return "unassigned";
  }
  if (st === "assigned" || st === "confirmed") return "assigned";
  if (st === "pending" || st === "pending_assignment") return "pending";
  if (st === "pending_payment") return "awaiting payment";
  return st ? st.replace(/_/g, " ") : "scheduled";
}

export type AssignmentKind = "team" | "roster" | "confirmed" | "preferred" | "none";

export function independentAssignmentKind(row: IndependentBookingRow): AssignmentKind {
  if (hasText(row.team_id)) return "team";
  if ((row.booking_cleaners ?? []).some((m) => hasText(m.cleaner_id))) return "roster";
  if (hasText(row.cleaner_id)) return "confirmed";
  if (hasText(row.selected_cleaner_id)) return "preferred";
  return "none";
}

export function applicationAssignmentKindFromLabel(label: string | null | undefined): AssignmentKind {
  if (!label) return "none";
  const s = label.trim().toLowerCase();
  if (s.startsWith("team")) return "team";
  if (s.startsWith("preferred")) return "preferred";
  if (s.includes(",")) return "roster";
  if (s.length > 0) return "confirmed";
  return "none";
}

function isSlaBreach(row: IndependentBookingRow, nowMs: number, slaMinutes: number): boolean {
  if (norm(row.status) !== "pending") return false;
  if (hasOpsAssignment(row)) return false;
  const ds = norm(row.dispatch_status);
  if (ds !== "searching" && ds !== "offered") return false;
  const clock = hasText(row.became_pending_at) ? String(row.became_pending_at) : row.created_at;
  if (!hasText(clock)) return false;
  const t = new Date(String(clock)).getTime();
  if (!Number.isFinite(t)) return false;
  return t < nowMs - slaMinutes * 60_000;
}

export type IndependentOpsQueue = "sla" | "unassignable" | "unassigned" | "starting-soon" | null;

export function independentClassifyOps(
  row: IndependentBookingRow,
  nowMs: number,
  slaMinutes = 10,
): IndependentOpsQueue {
  const st = norm(row.status);
  if (st === "completed" || TERMINAL.has(st) || st === "pending_payment") return null;
  const noCleaner = !hasOpsAssignment(row);
  if (isSlaBreach(row, nowMs, slaMinutes)) return "sla";
  if (norm(row.dispatch_status) === "unassignable" && noCleaner) return "unassignable";
  if (noCleaner && (isPaidOps(row) || isRecurringOrMonthlyAssignable(row))) return "unassigned";
  if (noCleaner) {
    const start = bookingStartUtcMs(row.date ?? null, row.time ?? null);
    if (start != null) {
      const mins = Math.round((start - nowMs) / 60_000);
      if (mins >= 0 && mins < 120) return "starting-soon";
    }
  }
  return null;
}

export function independentOpsSnapshot(
  rows: IndependentBookingRow[],
  nowMs = Date.now(),
  slaMinutes = 10,
) {
  const today = johannesburgYmd(new Date(nowMs));
  let unassignable = 0;
  let slaBreaches = 0;
  let unassigned = 0;
  let startingSoon = 0;
  for (const row of rows) {
    const q = independentClassifyOps(row, nowMs, slaMinutes);
    if (q === "unassignable") unassignable += 1;
    if (q === "sla") slaBreaches += 1;
    if (q === "unassigned") {
      unassigned += 1;
      void today; // retained for future day-bucket assertions
    }
    if (q === "starting-soon") startingSoon += 1;
  }
  return { unassignable, slaBreaches, unassigned, startingSoon };
}

export function independentPaymentDayRevenue(
  rows: IndependentBookingRow[],
  now = new Date(),
): {
  revenueTodayZar: number;
  paidBookingsToday: number;
  totalBookingsWindow: number;
  avgBookingValueZar: number;
} {
  const today = johannesburgYmd(now);
  const { startIso, endExclusiveIso } = johannesburgDayBounds(today);
  const windowStartIso = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
  let todayCents = 0;
  let todayCount = 0;
  let windowCents = 0;
  let windowCount = 0;
  const nowIso = now.toISOString();
  for (const row of rows) {
    if (!independentRevenueEligible(row)) continue;
    const paidAt = row.payment_completed_at ? new Date(row.payment_completed_at) : null;
    if (!paidAt || !Number.isFinite(paidAt.getTime())) continue;
    const iso = paidAt.toISOString();
    const cents = paidCents(row);
    if (iso >= startIso && iso < endExclusiveIso) {
      todayCents += cents;
      todayCount += 1;
    }
    if (iso >= windowStartIso && iso <= nowIso) {
      windowCents += cents;
      windowCount += 1;
    }
  }
  return {
    revenueTodayZar: Math.round(todayCents / 100),
    paidBookingsToday: todayCount,
    totalBookingsWindow: windowCount,
    avgBookingValueZar: averageBookingValueZar(windowCents / 100, windowCount),
  };
}

export function independentPendingZar(rows: IndependentBookingRow[]): number {
  let cents = 0;
  for (const row of rows) {
    if (norm(row.status) !== "pending_payment") continue;
    const ps = norm(row.payment_status);
    if (ps !== "pending" && ps !== "pending_payment") continue;
    cents += pendingCents(row);
  }
  return Math.round(cents / 100);
}

export function independentOverdueZar(rows: IndependentInvoiceRow[]): number {
  let cents = 0;
  for (const row of rows) {
    const overdue = norm(row.status) === "overdue" || row.is_overdue === true;
    if (!overdue) continue;
    const bal = Number(row.balance_cents);
    if (Number.isFinite(bal) && bal > 0) cents += bal;
  }
  return Math.round(cents / 100);
}

function weekdayIndexForYmd(ymd: string): number {
  const day = new Date(`${ymd}T12:00:00+02:00`).getDay();
  return Number.isFinite(day) ? day : new Date().getDay();
}

function rosterIncludesWeekday(raw: unknown, weekday: number): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return true;
  const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return raw.some((value) => {
    const v = String(value ?? "")
      .trim()
      .toLowerCase();
    if (!v) return false;
    const asNumber = Number(v);
    if (Number.isFinite(asNumber)) return asNumber === weekday || asNumber === weekday + 1;
    return v === names[weekday] || v.startsWith(names[weekday]!);
  });
}

function rosterCleanerIds(row: IndependentBookingRow): string[] {
  const fromRoster = (row.booking_cleaners ?? [])
    .map((m) => String(m.cleaner_id ?? "").trim())
    .filter(Boolean);
  if (fromRoster.length) return fromRoster;
  const direct = String(row.cleaner_id ?? "").trim();
  return direct ? [direct] : [];
}

type CapacityState = "offline" | "paused" | "off-today" | "in-job" | "booked" | "online";

function deriveCapacityState(input: {
  browserOnline: boolean;
  isAvailable: boolean;
  rosterIncludesToday: boolean;
  hasActiveJob: boolean;
  hasFutureBookedJob: boolean;
}): CapacityState {
  if (!input.browserOnline) return "offline";
  if (!input.isAvailable) return "paused";
  if (input.hasActiveJob) return "in-job";
  if (!input.rosterIncludesToday) return "off-today";
  if (input.hasFutureBookedJob) return "booked";
  return "online";
}

export function independentCleanerCapacity(params: {
  bookings: IndependentBookingRow[];
  cleaners: IndependentCleanerRow[];
  dateYmd: string;
}) {
  const activeIds = new Set(
    params.bookings
      .filter((b) => {
        const st = norm(b.status);
        return st === "in_progress" || st === "en_route";
      })
      .flatMap((b) => rosterCleanerIds(b)),
  );
  const bookedIds = new Set(
    params.bookings
      .filter((b) => {
        const st = norm(b.status);
        return (st === "assigned" || st === "confirmed") && rosterCleanerIds(b).length > 0;
      })
      .flatMap((b) => rosterCleanerIds(b)),
  );
  const weekday = weekdayIndexForYmd(params.dateYmd);
  const activeCleaners = params.cleaners.filter((c) => c.is_active == null || c.is_active === true);
  let availableIdle = 0;
  let busy = 0;
  let offToday = 0;
  let manuallyUnavailable = 0;
  for (const cleaner of activeCleaners) {
    const state = deriveCapacityState({
      browserOnline: norm(cleaner.status) !== "offline",
      isAvailable: cleaner.is_available === true,
      rosterIncludesToday: rosterIncludesWeekday(cleaner.availability_weekdays, weekday),
      hasActiveJob: activeIds.has(cleaner.id),
      hasFutureBookedJob: bookedIds.has(cleaner.id),
    });
    if (state === "online") availableIdle += 1;
    else if (state === "booked" || state === "in-job") busy += 1;
    else if (state === "off-today") offToday += 1;
    else if (state === "paused" || state === "offline") manuallyUnavailable += 1;
  }
  return {
    total: activeCleaners.length,
    availableIdle,
    busy,
    offToday,
    manuallyUnavailable,
  };
}

export function independentSystemHealthLabel(input: {
  website?: string | null;
  bookingEngine?: string | null;
  paymentGateway?: string | null;
  cronErrorsLast24h?: number | null;
}): string {
  const allOps =
    input.website === "operational" &&
    input.bookingEngine === "operational" &&
    input.paymentGateway === "operational";
  if (allOps) return "healthy";
  const cron = Number(input.cronErrorsLast24h ?? 0);
  if (Number.isFinite(cron) && cron > 0) return `${Math.trunc(cron)} errors`;
  return "attention";
}
