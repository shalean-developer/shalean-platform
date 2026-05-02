import type { CleanerUpcomingJob } from "./types";
import { UpcomingJobCard } from "./UpcomingJobCard";

type UpcomingJobsSectionProps = {
  jobs: CleanerUpcomingJob[];
};

export function UpcomingJobsSection({ jobs }: UpcomingJobsSectionProps) {
  return (
    <section aria-labelledby="cleaner-upcoming-heading">
      <h2 id="cleaner-upcoming-heading" className="mb-2 text-lg font-semibold text-foreground">
        📅 Upcoming Jobs
      </h2>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming jobs scheduled.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <UpcomingJobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </section>
  );
}
