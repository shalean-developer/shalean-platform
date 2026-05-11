"use client";

import type { CleanerUpcomingJob } from "./types";
import { UpcomingJobCard } from "./UpcomingJobCard";

type UpcomingJobsSectionProps = {
  jobs: CleanerUpcomingJob[];
  openJobCount: number;
  trackedJobCount: number;
  browserOnline?: boolean;
  receivingOffers?: boolean;
};

/**
 * Upcoming jobs list — operational cockpit variant.
 *
 * When there are no jobs at all, render NOTHING. Empty-state hand-holding
 * (go online, check back later) is already covered by the Status strip and
 * the NextJob empty hint above; repeating it here just adds vertical noise.
 *
 * When jobs exist, use a small uppercase label instead of a giant `<h2>` so
 * the section header doesn't compete with the primary action hero.
 */
export function UpcomingJobsSection({
  jobs,
  openJobCount: _openJobCount,
  trackedJobCount: _trackedJobCount,
  browserOnline: _browserOnline,
  receivingOffers: _receivingOffers,
}: UpcomingJobsSectionProps) {
  void _openJobCount;
  void _trackedJobCount;
  void _browserOnline;
  void _receivingOffers;

  if (jobs.length === 0) return null;

  return (
    <section aria-labelledby="cleaner-upcoming-heading">
      <h2
        id="cleaner-upcoming-heading"
        className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Upcoming
      </h2>
      <div className="space-y-2">
        {jobs.map((job) => (
          <UpcomingJobCard key={job.id} job={job} />
        ))}
      </div>
    </section>
  );
}
