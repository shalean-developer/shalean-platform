"use client";

import Link from "next/link";
import { ArrowRight, Navigation } from "lucide-react";
import type { CleanerUpcomingJob } from "./types";
import { Button } from "@/components/ui/button";
import { directionsHrefFromQuery } from "@/lib/cleaner/directionsHref";
import { cn } from "@/lib/utils";
import { JobEarningInline } from "./JobEarningInline";

type ActiveJobHeroProps = {
  job: CleanerUpcomingJob;
  /** Maps query string (suburb / first address line) to deep-link the navigation app. */
  mapsQuery: string | null;
};

function toneForPhase(phaseDisplay: string): { badgeClass: string; chipLabel: string } {
  const p = phaseDisplay.toLowerCase().trim();
  if (p === "in progress") {
    return {
      badgeClass: "bg-amber-600 text-white",
      chipLabel: "In progress",
    };
  }
  // En route / On the way / On my way
  return {
    badgeClass: "bg-sky-600 text-white",
    chipLabel: phaseDisplay || "En route",
  };
}

/**
 * Active-work hero — primary action surface on Home when the cleaner is
 * currently driving to or executing a job (`en_route` / `in_progress`).
 *
 * Why this exists in addition to {@link NextJobPin}:
 *  - The next-job pin is a "do this next" reminder; the active-job hero is
 *    a "you are doing this RIGHT NOW" affordance. Bundling lifecycle
 *    actions ("Mark on the way", "Start cleaning", "Mark complete") onto
 *    the dashboard would require extracting the orchestrator that lives
 *    inside the job-detail page — out of scope for this change. So this
 *    hero links straight to the detail page for those actions while still
 *    surfacing the most important context (suburb + Maps deep-link) above
 *    the fold.
 *  - The visual treatment (amber for in-progress, sky for en-route) keeps
 *    it distinguishable from the next-job pin's emerald.
 */
export function ActiveJobHero({ job, mapsQuery }: ActiveJobHeroProps) {
  const { badgeClass, chipLabel } = toneForPhase(job.phaseDisplay);
  const mapsHref =
    mapsQuery && mapsQuery.trim().length > 0 ? directionsHrefFromQuery(mapsQuery.trim()) : null;

  return (
    <section
      aria-label="Active job"
      className={cn(
        "rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-5 shadow-sm transition-[box-shadow,background-color,border-color] duration-200 ease-out hover:shadow-md dark:bg-amber-500/15",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={cn("rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider", badgeClass)}>
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
      {/* Same source-of-truth as the offer card — never added to "Today"
          earnings until the job is marked completed. */}
      <div className="mt-3">
        <JobEarningInline earning={job.jobEarning} />
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {mapsHref ? (
          <Button
            type="button"
            asChild
            className="min-h-11 h-11 flex-1 gap-2 bg-amber-600 text-white transition-colors duration-200 hover:bg-amber-600/90 active:scale-[0.98]"
          >
            <a href={mapsHref} target="_blank" rel="noopener noreferrer">
              <Navigation className="size-4 shrink-0" aria-hidden />
              Start navigation
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant={mapsHref ? "secondary" : "default"}
          className={cn(
            "min-h-11 h-11 flex-1 gap-2 active:scale-[0.98]",
            !mapsHref && "bg-amber-600 text-white hover:bg-amber-600/90",
          )}
          asChild
        >
          <Link href={job.href}>
            Open job
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
