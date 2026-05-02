import type { CleanerUpcomingJob } from "./types";

type UpcomingJobCardProps = {
  job: CleanerUpcomingJob;
};

export function UpcomingJobCard({ job }: UpcomingJobCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <p className="font-medium text-foreground">{job.timeLine}</p>
      <p className="text-sm text-muted-foreground">{job.suburb}</p>
    </div>
  );
}
