"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CleanerJobListCard } from "@/components/cleaner-jobs/CleanerJobListCard";
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
} from "@/lib/cleaner/cleanerJobsListDerived";
import {
  CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY,
  readTtlCompleteSyncLockFromSession,
} from "@/lib/cleaner/cleanerJobPendingLifecycleQueue";
import { subscribeTtlCompleteLockBroadcast } from "@/lib/cleaner/cleanerLifecycleTtlLockBroadcast";
import { CLEANER_DASHBOARD_JOBS_REFRESH_EVENT } from "@/lib/cleaner/cleanerDashboardSessionCache";
import { cn } from "@/lib/utils";
import { useCleanerRealtime } from "@/lib/realtime/useCleanerRealtime";
import { useUser } from "@/hooks/useUser";

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
  const { loading: userLoading } = useUser();
  const [rows, setRows] = useState<CleanerBookingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [ttlLockEpoch, setTtlLockEpoch] = useState(0);
  const [jobsRealtimeTick, setJobsRealtimeTick] = useState(0);
  /** `public.cleaners.id` for Realtime filters — can differ from Supabase auth uid when the row uses `auth_user_id`. */
  const [rtCleanerId, setRtCleanerId] = useState<string | null>(null);
  const [rtTeamIds, setRtTeamIds] = useState<string[]>([]);
  const workspaceFromApiRef = useRef(false);

  const now = useMemo(() => new Date(nowTick), [nowTick]);

  const openCount = useMemo(() => openJobCountFromRows(rows), [rows]);

  useEffect(() => {
    if (loading) return;
    setOpenJobsCount(openCount);
  }, [loading, openCount, setOpenJobsCount]);

  const loadJobs = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setErr("Not signed in.");
      setRows([]);
      workspaceFromApiRef.current = false;
      setRtCleanerId(null);
      setRtTeamIds([]);
      if (!silent) setLoading(false);
      return;
    }
    const fetchProfile = !workspaceFromApiRef.current;
    const jobsPromise = cleanerAuthenticatedFetch("/api/cleaner/jobs?view=card", { headers });
    const mePromise = fetchProfile ? cleanerAuthenticatedFetch("/api/cleaner/me", { headers }) : null;
    const res = await jobsPromise;
    const meRes = mePromise ? await mePromise : null;
    if (meRes) {
      const m = (await meRes.json().catch(() => ({}))) as { cleaner?: { id?: string }; teamIds?: unknown };
      if (meRes.ok && m.cleaner && typeof m.cleaner.id === "string") {
        const cid = m.cleaner.id.trim();
        if (cid) {
          workspaceFromApiRef.current = true;
          setRtCleanerId(cid);
          const tis = Array.isArray(m.teamIds)
            ? m.teamIds.filter((x): x is string => typeof x === "string" && Boolean(String(x).trim())).map((x) => String(x).trim())
            : [];
          setRtTeamIds(tis);
        }
      }
    }
    const j = (await res.json().catch(() => ({}))) as { jobs?: CleanerBookingRow[]; error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Could not load jobs.");
      setRows([]);
    } else {
      setErr(null);
      setRows(Array.isArray(j.jobs) ? j.jobs : []);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    if (userLoading) return;
    void loadJobs({ silent: jobsRealtimeTick > 0 });
  }, [userLoading, loadJobs, jobsRealtimeTick]);

  useEffect(() => {
    const onJobsRefresh = () => {
      void loadJobs({ silent: true });
    };
    window.addEventListener(CLEANER_DASHBOARD_JOBS_REFRESH_EVENT, onJobsRefresh);
    return () => window.removeEventListener(CLEANER_DASHBOARD_JOBS_REFRESH_EVENT, onJobsRefresh);
  }, [loadJobs]);

  const bumpJobsFromRealtime = useCallback(() => {
    setJobsRealtimeTick((n) => n + 1);
  }, []);

  useCleanerRealtime({
    cleanerId: userLoading ? undefined : rtCleanerId ?? undefined,
    debounceMs: 300,
    subscribeBookings: true,
    subscribeWorkSettings: false,
    workspaceBookingsRealtime: true,
    workspaceTeamIds: rtTeamIds,
    onBookingChange: bumpJobsFromRealtime,
  });

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

  const showUpcoming = filter === "all" || filter === "upcoming";
  const showPast = filter === "all" || filter === "completed";

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 bg-background px-4 pt-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 rounded-xl px-3 text-muted-foreground">
        <Link href="/cleaner/dashboard">← Home</Link>
      </Button>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Your jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Upcoming and past bookings.</p>
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
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No jobs available right now</p>
          <p className="mt-2">Stay online — we&apos;ll send jobs when available.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {showUpcoming ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                Upcoming
              </h2>
              {upcomingSorted.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">You&apos;re all caught up</p>
                  <p className="mt-1">Stay online — new jobs will appear here.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {upcomingSorted.map((r) => (
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
