import type { CleanerUpcomingJob } from "@/components/cleaner-dashboard/types";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { groupCleanerScheduleRows } from "@/lib/cleaner/cleanerMobileBookingMap";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";

const SECTION_ORDER = ["overdue", "today", "upcoming"] as const;

/** Open jobs grouped like the schedule tab (needs attention → today → future). */
export function buildDashboardUpcomingJobs(rows: CleanerBookingRow[], now: Date): CleanerUpcomingJob[] {
  const { sections } = groupCleanerScheduleRows(rows, now);
  const out: CleanerUpcomingJob[] = [];
  for (const key of SECTION_ORDER) {
    const sec = sections.find((s) => s.key === key);
    if (!sec) continue;
    for (const r of sec.rows) {
      const head = jobDateHeading(String(r.date ?? ""), now);
      const t = (r.time ?? "—").trim() || "—";
      out.push({
        id: r.id,
        timeLine: `${head} • ${t}`,
        suburb: suburbFromLocationForOffer(r.location),
      });
    }
  }
  return out.slice(0, 24);
}
