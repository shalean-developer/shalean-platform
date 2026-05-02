"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Navigation } from "lucide-react";
import type { CleanerUpcomingJob } from "./types";
import { Button } from "@/components/ui/button";
import { directionsHrefFromQuery } from "@/lib/cleaner/directionsHref";
import { cn } from "@/lib/utils";

type NextJobPinProps = {
  job: CleanerUpcomingJob;
  startsAtMs: number | null;
  mapsQuery: string | null;
  /** Added to `Date.now()` so countdown tracks server time (see dashboard `server_now_ms`). */
  clockOffsetMs?: number;
  embedded?: boolean;
};

function formatStartsIn(msUntil: number): string {
  if (msUntil <= 0) return "Starting now";
  const totalMin = Math.floor(msUntil / 60000);
  if (totalMin < 1) return "Starts in under a minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `Starts in ${m} min`;
  if (m === 0) return `Starts in ${h}h`;
  return `Starts in ${h}h ${m}m`;
}

function urgencyClass(msUntil: number | null): string {
  if (msUntil == null) return "text-emerald-900 dark:text-emerald-100";
  if (msUntil <= 15 * 60_000) return "font-bold text-red-700 dark:text-red-200";
  if (msUntil <= 45 * 60_000) return "font-bold text-red-600 dark:text-red-200/95";
  if (msUntil <= 2 * 60 * 60_000) return "font-semibold text-amber-800 dark:text-amber-100";
  return "font-semibold text-emerald-900 dark:text-emerald-100";
}

/** Single high-signal “do this next” card with actions. */
export function NextJobPin({ job, startsAtMs, mapsQuery, clockOffsetMs = 0, embedded }: NextJobPinProps) {
  const reduceMotion = useReducedMotion();
  const offsetRef = useRef(clockOffsetMs);
  offsetRef.current = clockOffsetMs;
  const nowAligned = () => Date.now() + offsetRef.current;

  const [nowMs, setNowMs] = useState(() => nowAligned());

  const msUntil = startsAtMs != null ? startsAtMs - nowMs : null;
  const startsInLine = startsAtMs != null ? formatStartsIn(msUntil ?? 0) : null;

  useEffect(() => {
    if (startsAtMs == null) return;
    let cancelled = false;
    let tid: number | null = null;

    const tick = () => {
      if (!cancelled) setNowMs(nowAligned());
    };

    const schedule = () => {
      if (cancelled) return;
      tick();
      const now = nowAligned();
      const until = startsAtMs - now;
      let delay: number;
      if (until <= 3 * 60_000) delay = 10_000;
      else if (until <= 15 * 60_000) delay = 30_000;
      else {
        const msIntoMin = now % 60_000;
        delay = Math.max(2_000, 60_000 - msIntoMin + 400);
      }
      tid = window.setTimeout(schedule, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (tid != null) window.clearTimeout(tid);
    };
  }, [startsAtMs, clockOffsetMs]);

  const mapsHref = mapsQuery && mapsQuery.trim().length > 0 ? directionsHrefFromQuery(mapsQuery.trim()) : null;

  const urgency = urgencyClass(msUntil);
  const pulseUrgent = msUntil != null && msUntil > 0 && msUntil <= 15 * 60_000;
  const StartsLine = (
    <span className={cn(urgency, pulseUrgent && "inline-block")}>
      {pulseUrgent && !reduceMotion ? (
        <motion.span
          className="inline-block will-change-[opacity]"
          animate={{ opacity: [1, 0.78, 1] }}
          transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        >
          {startsInLine}
        </motion.span>
      ) : (
        startsInLine
      )}
    </span>
  );

  return (
    <section
      aria-label="Next job"
      className={cn(
        "transition-[box-shadow,background-color,border-color] duration-200 ease-out",
        embedded
          ? "rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 dark:bg-emerald-500/12"
          : "rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 p-5 shadow-sm hover:shadow-md dark:bg-emerald-500/15",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
          Next job
        </span>
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-emerald-600/25">
          {job.phaseDisplay}
        </span>
      </div>
      {startsInLine ? <p className="mb-2 text-sm">{StartsLine}</p> : null}
      <div className="min-h-11">
        <p className="text-lg font-semibold leading-snug text-foreground">{job.timeLine}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{job.suburb}</p>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {mapsHref ? (
          <Button
            type="button"
            asChild
            className="min-h-11 h-11 flex-1 gap-2 bg-emerald-600 text-white transition-colors duration-200 hover:bg-emerald-600/90 active:scale-[0.98]"
          >
            <a href={mapsHref} target="_blank" rel="noopener noreferrer">
              <Navigation className="size-4 shrink-0" aria-hidden />
              Start navigation
            </a>
          </Button>
        ) : null}
        <Button type="button" variant="secondary" className="min-h-11 h-11 flex-1 active:scale-[0.98]" asChild>
          <Link href={job.href}>View details</Link>
        </Button>
      </div>
    </section>
  );
}
