import Link from "next/link";
import type { CleanerUpcomingJob } from "./types";

type UpcomingJobCardProps = {
  job: CleanerUpcomingJob;
};

function phaseChipClass(label: string): string {
  const s = label.trim().toLowerCase();
  if (s === "completed")
    return "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 border border-emerald-600/20";
  if (s === "in progress") return "bg-sky-500/15 text-sky-900 dark:text-sky-100 border border-sky-600/20";
  if (s === "en route") return "bg-amber-500/15 text-amber-950 dark:text-amber-100 border border-amber-600/25";
  if (s === "assigned") return "bg-violet-500/12 text-violet-900 dark:text-violet-100 border border-violet-600/18";
  if (s === "pending") return "bg-zinc-500/12 text-zinc-900 dark:text-zinc-100 border border-zinc-600/20";
  if (s === "cancelled") return "bg-muted text-muted-foreground border border-border";
  return "bg-muted text-muted-foreground border border-border";
}

export function UpcomingJobCard({ job }: UpcomingJobCardProps) {
  return (
    <Link
      href={job.href}
      className="block min-h-[44px] rounded-xl border border-border bg-card p-3 shadow-sm outline-none ring-offset-background transition-all hover:border-emerald-500/25 hover:bg-accent/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 font-medium text-foreground">{job.timeLine}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${phaseChipClass(job.phaseDisplay)}`}>
          {job.phaseDisplay}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{job.suburb}</p>
    </Link>
  );
}
