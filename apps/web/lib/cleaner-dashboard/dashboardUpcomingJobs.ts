import type { CleanerUpcomingJob } from "@/components/cleaner-dashboard/types";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { groupCleanerScheduleRows, mobilePhaseDisplayForDashboard } from "@/lib/cleaner/cleanerMobileBookingMap";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";
import { resolveCleanerJobEarning } from "@/lib/cleaner/cleanerJobEarning";

const SECTION_ORDER = ["overdue", "today", "upcoming", "completed"] as const;

const MAX_TOTAL = 36;
const MAX_COMPLETED = 10;

/** Single row → dashboard “Your jobs” / next-pin card shape. */
export function cleanerBookingRowToUpcomingJob(r: CleanerBookingRow, now: Date): CleanerUpcomingJob {
  const head = jobDateHeading(String(r.date ?? ""), now);
  const t = (r.time ?? "—").trim() || "—";
  return {
    id: r.id,
    timeLine: `${head} • ${t}`,
    suburb: suburbFromLocationForOffer(r.location),
    href: `/cleaner/jobs/${encodeURIComponent(r.id)}`,
    phaseDisplay: mobilePhaseDisplayForDashboard(r),
    /**
     * Reuses the same source-of-truth resolver as the offer card, so the
     * "Job earning: R___" label is identical from offer → next-job pin →
     * upcoming list → active-job hero. Returns "unavailable" when the
     * booking has no persisted earning AND the dashboard route's preview
     * pass also returned null (already logged as a data-integrity issue).
     */
    jobEarning: resolveCleanerJobEarning({
      cleaner_earnings_total_cents: r.cleaner_earnings_total_cents,
      payout_frozen_cents: r.payout_frozen_cents,
      display_earnings_cents: r.display_earnings_cents,
    }),
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
      out.push(cleanerBookingRowToUpcomingJob(r, now));
      used++;
    }
  }
  return out;
}
