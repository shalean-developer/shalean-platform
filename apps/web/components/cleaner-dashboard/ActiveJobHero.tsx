"use client";

import Link from "next/link";
import type { CleanerUpcomingJob } from "./types";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { CleanerJobPrimaryActionButton } from "@/components/cleaner/CleanerJobPrimaryActionButton";
import { cn } from "@/lib/utils";
import { JobEarningInline } from "./JobEarningInline";

type ActiveJobHeroProps = {
  job: CleanerUpcomingJob;
  bookingRow: CleanerBookingRow;
  mapsQuery: string | null;
  clockOffsetMs?: number;
  onRowPatched?: (bookingId: string, patch: Partial<CleanerBookingRow>) => void;
  onRefresh?: () => void | Promise<void>;
};

function toneForPhase(phaseDisplay: string): { badgeClass: string; chipLabel: string } {
  const p = phaseDisplay.toLowerCase().trim();
  if (p === "in progress") {
    return {
      badgeClass: "bg-amber-600 text-white",
      chipLabel: "In progress",
    };
  }
  return {
    badgeClass: "bg-sky-600 text-white",
    chipLabel: phaseDisplay || "En route",
  };
}

/**
 * Active-work hero — primary action surface on Home when the cleaner is
 * currently driving to or executing a job (`en_route` / `in_progress`).
 */
export function ActiveJobHero({
  job,
  bookingRow,
  mapsQuery,
  clockOffsetMs = 0,
  onRowPatched,
  onRefresh,
}: ActiveJobHeroProps) {
  const { badgeClass, chipLabel } = toneForPhase(job.phaseDisplay);

  return (
    <section
      aria-label="Active job"
      className={cn(
        "rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-5 shadow-sm transition-[box-shadow,background-color,border-color] duration-200 ease-out hover:shadow-md dark:bg-amber-500/15",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={cn("rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wider", badgeClass)}>
          Active job
        </span>
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-amber-600/25">
          {chipLabel}
        </span>
      </div>
      <div className="min-h-11">
        <p className="text-lg font-semibold leading-snug text-foreground">{job.timeLine}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{job.suburb}</p>
      </div>
      <div className="mt-3">
        <JobEarningInline earning={job.jobEarning} />
      </div>
      <div className="mt-4 space-y-2">
        <CleanerJobPrimaryActionButton
          bookingId={job.id}
          row={bookingRow}
          mapsQuery={mapsQuery}
          clockOffsetMs={clockOffsetMs}
          variant="hero"
          onRowPatched={onRowPatched}
          onRefresh={onRefresh}
        />
        <Link
          href={job.href}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-amber-600/30 bg-background/80 text-sm font-medium text-foreground transition-colors hover:bg-amber-500/10"
        >
          View job details
        </Link>
      </div>
    </section>
  );
}
