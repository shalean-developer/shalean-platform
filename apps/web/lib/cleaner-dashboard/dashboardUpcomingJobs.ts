import type { CleanerUpcomingJob } from "@/components/cleaner-dashboard/types";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { groupCleanerScheduleRows, mobilePhaseDisplayForDashboard } from "@/lib/cleaner/cleanerMobileBookingMap";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";

const SECTION_ORDER = ["overdue", "today", "upcoming", "completed"] as const;

const MAX_TOTAL = 36;
const MAX_COMPLETED = 10;

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
      const head = jobDateHeading(String(r.date ?? ""), now);
      const t = (r.time ?? "—").trim() || "—";
      out.push({
        id: r.id,
        timeLine: `${head} • ${t}`,
        suburb: suburbFromLocationForOffer(r.location),
        href: `/cleaner/jobs/${encodeURIComponent(r.id)}`,
        phaseDisplay: mobilePhaseDisplayForDashboard(r),
      });
      used++;
    }
  }
  return out;
}
