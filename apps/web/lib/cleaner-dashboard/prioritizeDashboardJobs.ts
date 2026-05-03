import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { earningsPeriodBucketYmd } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { getJhbTodayRange } from "@/lib/dashboard/johannesburgMonth";

const MAX_DASHBOARD_JOBS = 12;

function statusOf(r: CleanerBookingRow): string {
  return String(r.status ?? "")
    .trim()
    .toLowerCase();
}

function dateYmd(r: CleanerBookingRow): string {
  return String(r.date ?? "").trim().slice(0, 10);
}

function isOpen(r: CleanerBookingRow): boolean {
  const s = statusOf(r);
  return s !== "completed" && s !== "cancelled";
}

function sortByDateThenTimeAsc(a: CleanerBookingRow, b: CleanerBookingRow): number {
  const da = dateYmd(a);
  const db = dateYmd(b);
  if (da !== db) return da.localeCompare(db);
  return String(a.time ?? "").localeCompare(String(b.time ?? ""));
}

function sortByCompletedAtDesc(a: CleanerBookingRow, b: CleanerBookingRow): number {
  return String(b.completed_at ?? "").localeCompare(String(a.completed_at ?? ""));
}

/**
 * Dedupe by `id` (last row wins — matches PostgREST “last duplicate” if any).
 */
export function dedupeBookingsById(rows: readonly CleanerBookingRow[]): CleanerBookingRow[] {
  const m = new Map<string, CleanerBookingRow>();
  for (const r of rows) {
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    m.set(id, r);
  }
  return [...m.values()];
}

/**
 * Mobile dashboard ordering: **today open** (soonest time) → **overdue** → **future** → **completed today (JHB bucket)**.
 */
export function prioritizeDashboardJobsForDisplay(
  rows: readonly CleanerBookingRow[],
  now = new Date(),
  max = MAX_DASHBOARD_JOBS,
  /** When omitted, derived from `now` via {@link getJhbTodayRange} (Johannesburg civil day). */
  todayYmdOverride?: string,
): CleanerBookingRow[] {
  const ov = String(todayYmdOverride ?? "").trim().slice(0, 10);
  const todayY = /^\d{4}-\d{2}-\d{2}$/.test(ov) ? ov : getJhbTodayRange(now).todayYmd;
  const deduped = dedupeBookingsById(rows);

  const todayOpen = deduped
    .filter((r) => isOpen(r) && dateYmd(r) === todayY)
    .sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));

  const overdue = deduped.filter((r) => isOpen(r) && dateYmd(r) && dateYmd(r) < todayY).sort(sortByDateThenTimeAsc);

  const future = deduped.filter((r) => isOpen(r) && dateYmd(r) > todayY).sort(sortByDateThenTimeAsc);

  const completedToday = deduped
    .filter((r) => {
      if (statusOf(r) !== "completed") return false;
      const bucket = earningsPeriodBucketYmd({
        completed_at: r.completed_at ?? null,
        schedule_date: r.date ?? null,
      });
      return bucket === todayY;
    })
    .sort(sortByCompletedAtDesc);

  const merged = [...todayOpen, ...overdue, ...future, ...completedToday];
  if (merged.length <= max) return merged;

  /** Earliest future-dated open booking (date > JHB today). Never drop entirely when truncating — avoids “no next job” while tomorrow is assigned. */
  const earliestFuture = future[0];
  const head = merged.slice(0, max);
  if (earliestFuture && !head.some((r) => r.id === earliestFuture.id)) {
    return [earliestFuture, ...merged.filter((r) => r.id !== earliestFuture.id).slice(0, max - 1)];
  }
  return head;
}
