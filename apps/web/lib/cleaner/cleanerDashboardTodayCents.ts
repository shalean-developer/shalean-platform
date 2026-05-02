import {
  earningsPeriodBucketYmd,
  earningsPeriodCentsFromRows,
} from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { getJhbTodayRange } from "@/lib/dashboard/johannesburgMonth";
import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { addDaysYmd } from "@/lib/recurring/johannesburgCalendar";

export type CleanerDashboardEarningsWireRow = {
  id: string;
  service?: string | null;
  location?: string | null;
  status?: string | null;
  date?: string | null;
  completed_at?: string | null;
  cleaner_earnings_total_cents?: unknown;
  payout_frozen_cents?: unknown;
  display_earnings_cents?: unknown;
};

/** Tight wire for “today” expandable list (dashboard + client). */
export type CleanerDashboardTodayBreakdownItem = {
  booking_id: string;
  label: string;
  cents: number;
  completed_at: string;
};

function dedupeEarningsRows(rows: readonly CleanerDashboardEarningsWireRow[]): CleanerDashboardEarningsWireRow[] {
  const m = new Map<string, CleanerDashboardEarningsWireRow>();
  for (const r of rows) {
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    m.set(id, r);
  }
  return [...m.values()];
}

const DAILY_GOAL_FALLBACK_CENTS = 40_000;
const DAILY_GOAL_CEILING_CENTS = 500_000;

/**
 * Rolling 7 Johannesburg calendar days ending today: average daily completed earnings × 1.1.
 * Uses the same booking wire as the dashboard list (capped fetch — best-effort when history is sparse).
 */
export function suggestedDailyGoalCentsFromWireRows(
  rows: readonly CleanerDashboardEarningsWireRow[],
  now = new Date(),
): number {
  const { todayYmd } = getJhbTodayRange(now);
  const dayKeys: string[] = [];
  for (let i = 0; i < 7; i++) {
    dayKeys.push(addDaysYmd(todayYmd, -i));
  }
  const allowed = new Set(dayKeys);
  const byDay = new Map<string, number>();
  for (const d of dayKeys) byDay.set(d, 0);

  const unique = dedupeEarningsRows(rows);
  for (const r of unique) {
    if (String(r.status ?? "").trim().toLowerCase() !== "completed") continue;
    const cents =
      resolveCleanerEarningsCents({
        cleaner_earnings_total_cents: r.cleaner_earnings_total_cents,
        payout_frozen_cents: r.payout_frozen_cents,
        display_earnings_cents: optionalCentsFromDb(r.display_earnings_cents),
      }) ?? 0;
    const rounded = Math.max(0, Math.round(cents));
    if (rounded <= 0) continue;
    const bucket = earningsPeriodBucketYmd({
      completed_at: r.completed_at ?? null,
      schedule_date: r.date ?? null,
    });
    if (!bucket || !allowed.has(bucket)) continue;
    byDay.set(bucket, (byDay.get(bucket) ?? 0) + rounded);
  }

  const total = dayKeys.reduce((s, d) => s + (byDay.get(d) ?? 0), 0);
  if (total <= 0) return DAILY_GOAL_FALLBACK_CENTS;
  const avgDaily = total / 7;
  const goal = Math.round(avgDaily * 1.1);
  return Math.min(DAILY_GOAL_CEILING_CENTS, Math.max(DAILY_GOAL_FALLBACK_CENTS, goal));
}

function breakdownLabel(row: CleanerDashboardEarningsWireRow): string {
  const loc = String(row.location ?? "").trim();
  if (loc) {
    const line = loc.split(/\r?\n/)[0]?.trim() ?? loc;
    return line.length <= 44 ? line : `${line.slice(0, 43)}…`;
  }
  return String(row.service ?? "").trim() || "Cleaning";
}

function completedAtIso(row: CleanerDashboardEarningsWireRow): string {
  const raw = row.completed_at;
  if (raw == null || raw === "") return "";
  return String(raw).trim();
}

/** Stable sort + wire field when `completed_at` is missing on legacy rows. */
function completedAtForBreakdown(row: CleanerDashboardEarningsWireRow): string {
  const iso = completedAtIso(row);
  if (iso) return iso;
  const d = String(row.date ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T23:59:59.999+02:00`;
  return new Date(0).toISOString();
}

/**
 * Today's cleaner earnings (Africa/Johannesburg) + per-booking breakdown.
 * Dedupes by booking id before summing (OR visibility can theoretically duplicate rows).
 */
export function todayCentsAndBreakdownFromBookings(
  rows: readonly CleanerDashboardEarningsWireRow[],
  now = new Date(),
): { today_cents: number; today_breakdown: CleanerDashboardTodayBreakdownItem[] } {
  const unique = dedupeEarningsRows(rows);
  const completed = unique.filter((r) => String(r.status ?? "").trim().toLowerCase() === "completed");

  const periodInputs = completed.map((r) => {
    const cents =
      resolveCleanerEarningsCents({
        cleaner_earnings_total_cents: r.cleaner_earnings_total_cents,
        payout_frozen_cents: r.payout_frozen_cents,
        display_earnings_cents: optionalCentsFromDb(r.display_earnings_cents),
      }) ?? 0;
    return {
      row: r,
      amount_cents: Math.max(0, Math.round(cents)),
      completed_at: r.completed_at ?? null,
      schedule_date: r.date ?? null,
    };
  });

  const { today_cents } = earningsPeriodCentsFromRows(
    periodInputs.map((p) => ({
      completed_at: p.completed_at,
      schedule_date: p.schedule_date,
      amount_cents: p.amount_cents,
    })),
    now,
  );

  const todayY = getJhbTodayRange(now).todayYmd;
  const today_breakdown: CleanerDashboardTodayBreakdownItem[] = periodInputs
    .filter((p) => {
      const bucket = earningsPeriodBucketYmd({
        completed_at: p.completed_at,
        schedule_date: p.schedule_date,
      });
      return bucket === todayY && p.amount_cents > 0;
    })
    .map((p) => ({
      booking_id: p.row.id,
      label: breakdownLabel(p.row),
      cents: p.amount_cents,
      completed_at: completedAtForBreakdown(p.row),
    }))
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
    .slice(0, 20);

  return { today_cents, today_breakdown };
}
