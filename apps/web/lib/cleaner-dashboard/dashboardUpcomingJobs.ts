import { cleanerJobDetailHref } from "@/lib/cleaner/cleanerJobDetailHref";
import type { CleanerUpcomingJob } from "@/components/cleaner-dashboard/types";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { groupCleanerScheduleRows, mobilePhaseDisplayForDashboard } from "@/lib/cleaner/cleanerMobileBookingMap";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { cleanerFacingAreaLabel } from "@/lib/cleaner/cleanerOfferLocationSuburb";
import { cleanerJobEarningFromCents, resolveCleanerJobEarning } from "@/lib/cleaner/cleanerJobEarning";
import { cleanerFacingDisplayEarningsCents } from "@/lib/cleaner/cleanerMobileBookingMap";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";

const SECTION_ORDER = ["overdue", "today", "upcoming", "completed"] as const;

const MAX_TOTAL = 36;
const MAX_COMPLETED = 10;

/** Single row → dashboard “Your jobs” / next-pin card shape. */
export function cleanerBookingRowToUpcomingJob(r: CleanerBookingRow, now: Date, todayYmdOverride?: string): CleanerUpcomingJob {
  const todayYmd = (() => {
    const ov = String(todayYmdOverride ?? "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(ov) ? ov : johannesburgCalendarYmd(now);
  })();
  const dateYmd = String(r.date ?? "").trim().slice(0, 10);
  const status = String(r.status ?? "").trim().toLowerCase();
  const isOverdue =
    /^\d{4}-\d{2}-\d{2}$/.test(dateYmd) &&
    dateYmd < todayYmd &&
    status !== "completed" &&
    status !== "cancelled";
  const head = jobDateHeading(String(r.date ?? ""), now);
  const t = (r.time ?? "—").trim() || "—";
  const schedule = `${head} • ${t}`;
  return {
    id: r.id,
    timeLine: isOverdue ? `Overdue · ${schedule}` : schedule,
    suburb: cleanerFacingAreaLabel(r),
    href: cleanerJobDetailHref(r.id),
    phaseDisplay: mobilePhaseDisplayForDashboard(r),
    /**
     * Reuses the same source-of-truth resolver as the offer card, so the
     * "Job earning: R___" label is identical from offer → next-job pin →
     * upcoming list → active-job hero. Returns "unavailable" when the
     * booking has no persisted earning AND the dashboard route's preview
     * pass also returned null (already logged as a data-integrity issue).
     */
    jobEarning: (() => {
      const previewCents = cleanerFacingDisplayEarningsCents(r);
      if (previewCents != null && previewCents > 0) return cleanerJobEarningFromCents(previewCents);
      return resolveCleanerJobEarning({
        cleaner_earnings_total_cents: r.cleaner_earnings_total_cents,
        payout_frozen_cents: r.payout_frozen_cents,
        display_earnings_cents: r.display_earnings_cents,
      });
    })(),
  };
}

/** Open + recent completed jobs (grouped like schedule tab; capped for dashboard). */
export function buildDashboardUpcomingJobs(
  rows: CleanerBookingRow[],
  now: Date,
  /** Johannesburg `YYYY-MM-DD` for “today”; omit to derive from `now`. */
  todayYmdOverride?: string,
): CleanerUpcomingJob[] {
  const { sections } = groupCleanerScheduleRows(rows, now, todayYmdOverride);
  const out: CleanerUpcomingJob[] = [];
  let used = 0;

  for (const key of SECTION_ORDER) {
    const sec = sections.find((s) => s.key === key);
    if (!sec || used >= MAX_TOTAL) break;
    const cap = key === "completed" ? MAX_COMPLETED : MAX_TOTAL - used;
    const slice = sec.rows.slice(0, Math.max(0, cap));
    for (const r of slice) {
      if (used >= MAX_TOTAL) break;
      out.push(cleanerBookingRowToUpcomingJob(r, now, todayYmdOverride));
      used++;
    }
  }
  return out;
}
