"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { scheduleLineRich } from "@/lib/cleaner/cleanerJobCardFormat";
import { formatZarFromCents, formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import type { CleanerMobileJobView } from "@/lib/cleaner/cleanerMobileBookingMap";

function payLine(job: CleanerMobileJobView): { label: string; isEstimate: boolean } {
  if (job.earningsCents != null && job.earningsCents > 0) {
    return { label: formatZarFromCents(job.earningsCents), isEstimate: job.earningsIsEstimate };
  }
  if (job.jobTotalZar != null && Number.isFinite(job.jobTotalZar) && job.jobTotalZar > 0) {
    return { label: `R ${formatZarWhole(Math.round(job.jobTotalZar))}`, isEstimate: true };
  }
  return { label: "—", isEstimate: false };
}

export function CleanerNextJobEarningsCard({ job }: { job: CleanerMobileJobView | null }) {
  if (!job) {
    return (
      <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Next job</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No upcoming jobs on your schedule. Check Home for offers.</p>
      </section>
    );
  }

  const pay = payLine(job);

  return (
    <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Next job</p>
      <p className="mt-1 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{scheduleLineRich(job)}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{job.areaLabel}</p>
      <p className="mt-2 text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
        {pay.isEstimate ? "Est. " : ""}
        {pay.label}
      </p>
      <Button asChild className="mt-3 h-11 w-full text-base font-semibold" size="lg">
        <Link href={`/cleaner/job/${encodeURIComponent(job.id)}`}>View details</Link>
      </Button>
    </section>
  );
}
