import type { CleanerUpcomingJob } from "./types";
import { UpcomingJobCard } from "./UpcomingJobCard";

type UpcomingJobsSectionProps = {
  jobs: CleanerUpcomingJob[];
  openJobCount: number;
  trackedJobCount: number;
  browserOnline?: boolean;
  receivingOffers?: boolean;
};

export function UpcomingJobsSection({
  jobs,
  openJobCount: _openJobCount,
  trackedJobCount,
  browserOnline = true,
  receivingOffers = true,
}: UpcomingJobsSectionProps) {
  void _openJobCount;

  return (
    <section aria-labelledby="cleaner-upcoming-heading">
      <h2 id="cleaner-upcoming-heading" className="mb-2 text-xl font-bold tracking-tight text-foreground">
        Your jobs
      </h2>

      {jobs.length === 0 ? (
        <div className="space-y-2 text-muted-foreground">
          {trackedJobCount === 0 ? (
            <>
              <p className="text-base font-semibold text-foreground">No jobs scheduled yet</p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {!browserOnline ? <li>Go online to receive job offers.</li> : null}
                {browserOnline && receivingOffers ? (
                  <li>Stay online — we&apos;ll send offers when there&apos;s a match.</li>
                ) : null}
                {browserOnline && !receivingOffers ? (
                  <li>Turn on job offers to start receiving work.</li>
                ) : null}
                <li>Or check back later today.</li>
              </ul>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-foreground">No jobs in this list right now</p>
              <p className="text-sm leading-relaxed">
                Assigned visits will appear here. We&apos;ll notify you as soon as a job is available.
              </p>
            </>
          )}
        </div>
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
