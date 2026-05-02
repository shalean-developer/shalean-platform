"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CleanerJobListCard } from "@/components/cleaner-jobs/CleanerJobListCard";
import { CleanerNextJobHero } from "@/components/cleaner-jobs/CleanerNextJobHero";
import { useCleanerNavBadges } from "@/components/cleaner-dashboard/CleanerNavBadgesContext";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import {
  groupRowsByBookingDateDesc,
  isCompletedCleanerJobRow,
  isOpenCleanerJobRow,
  jobsListAdaptivePollMs,
  sortUpcomingJobsAsc,
  splitJobLocationPrimarySecondary,
  summarizeCleanerJobsThisIsoWeek,
  trailingWeekGoalGapZar,
} from "@/lib/cleaner/cleanerJobsListDerived";
import { formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import {
  CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY,
  readTtlCompleteSyncLockFromSession,
} from "@/lib/cleaner/cleanerJobPendingLifecycleQueue";
import { subscribeTtlCompleteLockBroadcast } from "@/lib/cleaner/cleanerLifecycleTtlLockBroadcast";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "upcoming" | "completed";

function openJobCountFromRows(list: CleanerBookingRow[]): number {
  return list.filter((r) => isOpenCleanerJobRow(r)).length;
}

function tabClass(active: boolean): string {
  return cn(
    "h-9 flex-1 rounded-full border px-2 text-xs font-medium transition-colors sm:text-sm",
    active
      ? "border-foreground/20 bg-foreground text-background hover:bg-foreground/90"
      : "border-border bg-card text-muted-foreground hover:bg-accent/50",
  );
}

export default function CleanerJobsListPage() {
  const { setOpenJobsCount } = useCleanerNavBadges();
  const [rows, setRows] = useState<CleanerBookingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [ttlLockEpoch, setTtlLockEpoch] = useState(0);

  const now = useMemo(() => new Date(nowTick), [nowTick]);

  const openCount = useMemo(() => openJobCountFromRows(rows), [rows]);

  useEffect(() => {
    if (loading) return;
    setOpenJobsCount(openCount);
  }, [loading, openCount, setOpenJobsCount]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        if (!cancelled) {
          setErr("Not signed in.");
          setLoading(false);
        }
        return;
      }
      const res = await cleanerAuthenticatedFetch("/api/cleaner/jobs?view=card", { headers });
      const j = (await res.json().catch(() => ({}))) as { jobs?: CleanerBookingRow[]; error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setErr(j.error ?? "Could not load jobs.");
        setRows([]);
      } else {
        setErr(null);
        setRows(Array.isArray(j.jobs) ? j.jobs : []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let debounce: number | null = null;
    const bump = () => {
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        setTtlLockEpoch((n) => n + 1);
      }, 150);
    };
    window.addEventListener("cleaner-ttl-complete-lock", bump);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY) bump();
    };
    window.addEventListener("storage", onStorage);
    const unsubBc = subscribeTtlCompleteLockBroadcast(() => bump());
    return () => {
      if (debounce != null) window.clearTimeout(debounce);
      window.removeEventListener("cleaner-ttl-complete-lock", bump);
      window.removeEventListener("storage", onStorage);
      unsubBc();
    };
  }, []);

  const ttlCompleteLock = useMemo(() => {
    void ttlLockEpoch;
    void nowTick;
    return readTtlCompleteSyncLockFromSession();
  }, [ttlLockEpoch, nowTick]);

  const week = useMemo(() => summarizeCleanerJobsThisIsoWeek(rows, now), [rows, now]);
  const goalGap = useMemo(() => trailingWeekGoalGapZar(rows, now), [rows, now]);

  const upcomingRaw = useMemo(() => rows.filter((r) => isOpenCleanerJobRow(r)), [rows]);
  const upcomingSorted = useMemo(() => sortUpcomingJobsAsc(upcomingRaw), [upcomingRaw]);

  useEffect(() => {
    const ms = jobsListAdaptivePollMs(upcomingRaw, nowTick);
    const id = window.setTimeout(() => setNowTick(Date.now()), ms);
    return () => window.clearTimeout(id);
  }, [nowTick, upcomingRaw]);

  const pastRaw = useMemo(() => {
    const st = (r: CleanerBookingRow) => String(r.status ?? "").toLowerCase();
    return rows.filter((r) => st(r) === "completed" || st(r) === "cancelled");
  }, [rows]);

  const pastForFilter = useMemo(() => {
    if (filter === "completed") return pastRaw.filter((r) => isCompletedCleanerJobRow(r));
    return pastRaw;
  }, [filter, pastRaw]);

  const pastGrouped = useMemo(() => groupRowsByBookingDateDesc(pastForFilter), [pastForFilter]);

  const todayYmd = useMemo(() => johannesburgCalendarYmd(now), [now]);
  const todayOpenJobs = useMemo(() => {
    return sortUpcomingJobsAsc(upcomingRaw.filter((r) => String(r.date ?? "").slice(0, 10) === todayYmd));
  }, [upcomingRaw, todayYmd]);
  const openTodayCount = todayOpenJobs.length;

  const nextJob = upcomingSorted[0] ?? null;
  const commandGlobalLine = useMemo(() => {
    if (!nextJob) return null;
    const d = String(nextJob.date ?? "").trim().slice(0, 10);
    const t = String(nextJob.time ?? "").trim() || "—";
    const { primary } = splitJobLocationPrimarySecondary(nextJob.location);
    if (d === todayYmd) return `Next: ${t} in ${primary}`;
    const head = /^\d{4}-\d{2}-\d{2}$/.test(d) ? jobDateHeading(d, now) : "Scheduled";
    return `Next: ${head} · ${t} in ${primary}`;
  }, [nextJob, todayYmd, now]);

  const showUpcoming = filter === "all" || filter === "upcoming";
  const showPast = filter === "all" || filter === "completed";
  const showNextHero = Boolean(showUpcoming && nextJob);

  const listUpcoming = useMemo(() => {
    if (!showNextHero || !nextJob) return upcomingSorted;
    return upcomingSorted.filter((r) => r.id !== nextJob.id);
  }, [showNextHero, nextJob, upcomingSorted]);

  const earnedZar = Math.max(0, Math.round(week.earnedCents / 100));

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg space-y-4 bg-background px-4 pb-28 pt-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 rounded-xl px-3 text-muted-foreground">
        <Link href="/cleaner/dashboard">← Home</Link>
      </Button>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Your jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Work timeline — upcoming first, then history.</p>
      </div>

      {ttlCompleteLock ? (
        <div
          className="rounded-xl border border-rose-600/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-950 dark:text-rose-50"
          role="alert"
        >
          <p className="font-semibold">Confirm your last job on its page</p>
          <p className="mt-1 text-xs opacity-95">
            A completion may not have reached the server before it expired from this device. Open that job and use{" "}
            <strong>Refresh details</strong> before completing again.
          </p>
        </div>
      ) : null}

      {!loading && !err && rows.length > 0 && (openTodayCount > 0 || commandGlobalLine) ? (
        <div className="space-y-1 rounded-xl border border-emerald-600/20 bg-emerald-500/5 p-3 text-sm">
          {openTodayCount > 0 ? (
            <p className="font-semibold text-foreground">
              {openTodayCount} job{openTodayCount === 1 ? "" : "s"} today
            </p>
          ) : null}
          {todayOpenJobs[0] ? (
            <p className="text-muted-foreground">
              Next: {String(todayOpenJobs[0].time ?? "").trim() || "—"} in{" "}
              {splitJobLocationPrimarySecondary(todayOpenJobs[0].location).primary}
            </p>
          ) : null}
          {todayOpenJobs.slice(1).map((job) => (
            <p key={job.id} className="text-muted-foreground">
              Then: {String(job.time ?? "").trim() || "—"} in {splitJobLocationPrimarySecondary(job.location).primary}
            </p>
          ))}
          {todayOpenJobs.length === 0 && commandGlobalLine ? (
            <p className="text-muted-foreground">{commandGlobalLine}</p>
          ) : null}
        </div>
      ) : null}

      {!loading && !err && rows.length > 0 ? (
        <div className="rounded-xl border border-border bg-card/80 p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This week</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {week.completedCountInWeek} job{week.completedCountInWeek === 1 ? "" : "s"} completed · {formatZarWhole(earnedZar)}{" "}
            earned
          </p>
          {goalGap.remainderZar > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatZarWhole(goalGap.remainderZar)} to reach your goal
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && !err ? (
        <div className="flex gap-2" role="tablist" aria-label="Job filters">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={tabClass(filter === "all")}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "upcoming"}
            className={tabClass(filter === "upcoming")}
            onClick={() => setFilter("upcoming")}
          >
            Upcoming
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "completed"}
            className={tabClass(filter === "completed")}
            onClick={() => setFilter("completed")}
          >
            Completed
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs to show yet.</p>
      ) : (
        <div className="space-y-8">
          {showUpcoming ? (
            <section className="space-y-3">
              {showNextHero && nextJob ? <CleanerNextJobHero row={nextJob} now={now} /> : null}
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                Upcoming
              </h2>
              {upcomingSorted.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">You&apos;re all caught up</p>
                  <p className="mt-1">Stay online — new jobs will appear here.</p>
                </div>
              ) : listUpcoming.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other upcoming jobs.</p>
              ) : (
                <ul className="space-y-2">
                  {listUpcoming.map((r) => (
                    <li key={r.id}>
                      <CleanerJobListCard row={r} variant="upcoming" now={now} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {showPast ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Past jobs</h2>
              {pastForFilter.length === 0 ? (
                <p className="text-sm text-muted-foreground">No past jobs in this view.</p>
              ) : (
                <div className="space-y-5">
                  {[...pastGrouped.entries()].map(([ymd, list]) => {
                    const heading = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? jobDateHeading(ymd, now) : ymd;
                    return (
                      <div key={ymd} className="space-y-2">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{heading}</h3>
                        <ul className="space-y-2">
                          {list.map((r) => (
                            <li key={r.id}>
                              <CleanerJobListCard row={r} variant="past" now={now} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
