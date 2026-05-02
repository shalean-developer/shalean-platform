import { earningsPeriodBucketYmd } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { parseYmdSast } from "@/lib/recurring/johannesburgCalendar";
import type { CleanerEarningsRowWire, EarningsPeriod } from "@/lib/cleaner/earnings/types";

function cents(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export function rowInPeriod(
  ymd: string | null,
  period: EarningsPeriod,
  todayY: string,
  weekStart: string,
  monthPrefix: string,
): boolean {
  if (!ymd) return false;
  if (period === "today") return ymd === todayY;
  if (period === "week") return ymd >= weekStart && ymd <= todayY;
  return ymd.slice(0, 7) === monthPrefix;
}

export function lastJobInPeriod(
  rows: readonly CleanerEarningsRowWire[],
  period: EarningsPeriod,
  todayY: string,
  weekStart: string,
  monthPrefix: string,
): CleanerEarningsRowWire | null {
  const sorted = [...rows].filter((r) => cents(r.amount_cents) > 0 && r.completed_at?.trim()).sort((a, b) => {
    const ta = new Date(a.completed_at!).getTime();
    const tb = new Date(b.completed_at!).getTime();
    return tb - ta;
  });
  for (const r of sorted) {
    const ymd = earningsPeriodBucketYmd({ completed_at: r.completed_at, schedule_date: r.date });
    if (rowInPeriod(ymd, period, todayY, weekStart, monthPrefix)) return r;
  }
  return null;
}

export function groupRowsByDayForTimeline(rows: readonly CleanerEarningsRowWire[]): Map<string, CleanerEarningsRowWire[]> {
  const map = new Map<string, CleanerEarningsRowWire[]>();
  const sorted = [...rows].filter((r) => cents(r.amount_cents) > 0).sort((a, b) => {
    const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return tb - ta;
  });
  for (const r of sorted) {
    const ymd = earningsPeriodBucketYmd({ completed_at: r.completed_at, schedule_date: r.date });
    if (!ymd) continue;
    const list = map.get(ymd) ?? [];
    list.push(r);
    map.set(ymd, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => {
      const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return tb - ta;
    });
  }
  return map;
}

export function dayHeading(ymd: string, todayY: string): string {
  if (ymd === todayY) return "Today";
  const t0 = parseYmdSast(todayY).getTime();
  const t1 = parseYmdSast(ymd).getTime();
  const diffDays = Math.round((t0 - t1) / 86_400_000);
  if (diffDays === 1) return "Yesterday";
  return parseYmdSast(ymd).toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function jhbTimeLabel(iso: string | null | undefined): string {
  if (!iso || !String(iso).trim()) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" });
}

export function bookingStatusBadgeLabel(status: string | null | undefined): { label: string; tone: "ok" | "muted" | "warn" } {
  const s = String(status ?? "completed").trim().toLowerCase();
  if (s === "completed") return { label: "Completed", tone: "ok" };
  if (s === "cancelled") return { label: "Cancelled", tone: "muted" };
  if (s === "failed" || s === "no_show" || s === "no-show") return { label: "No-show / issue", tone: "warn" };
  return { label: s.replace(/_/g, " "), tone: "muted" };
}
