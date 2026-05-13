"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CleanerJobListCard } from "@/components/cleaner-jobs/CleanerJobListCard";
import { PendingOffersBanner } from "@/components/cleaner-jobs/PendingOffersBanner";
import { useCleanerNavBadges } from "@/components/cleaner-dashboard/CleanerNavBadgesContext";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import {
  groupRowsByBookingDateDesc,
  isActiveCleanerJobRow,
  isCancelledCleanerJobRow,
  isCompletedCleanerJobRow,
  isOpenCleanerJobRow,
  isPastCleanerJobRow,
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

type FilterTab = "all" | "active" | "upcoming" | "completed" | "cancelled";

const FILTER_TABS: ReadonlyArray<{ id: FilterTab; label: string }> = [
  { id: "all", label: "All" },
  // Active appears before Upcoming because it's the most operational
  // ("you're in flight") — matches the dispatch-console hierarchy on Home.
  { id: "active", label: "Active" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

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
  const { setOpenJobsCount, setPendingOffersCount } = useCleanerNavBadges();
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
  /**
   * Pending dispatch offers visible to this cleaner. Sourced from `/api/cleaner/offers` so we can
   * surface a "you have offers waiting" banner here — the Jobs list itself only shows bookings the
   * cleaner already has access to (assigned / roster / team / payout owner). Without this banner a
   * selected-cleaner offer (`bookings.status = pending_assignment`, `dispatch_offers.status = pending`)
   * would silently sit on the dashboard while the Jobs page misleadingly says "No jobs available".
   */
  const [pendingOfferCount, setPendingOfferCount] = useState(0);

  const now = useMemo(() => new Date(nowTick), [nowTick]);

  const openCount = useMemo(() => openJobCountFromRows(rows), [rows]);

  useEffect(() => {
    if (loading) return;
    setOpenJobsCount(openCount);
  }, [loading, openCount, setOpenJobsCount]);

  // Keep the Home-tab badge live while the cleaner is on the Jobs page —
  // /api/cleaner/offers is fetched here for the PendingOffersBanner anyway.
  useEffect(() => {
    if (loading) return;
    setPendingOffersCount(pendingOfferCount);
  }, [loading, pendingOfferCount, setPendingOffersCount]);

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
      setPendingOfferCount(0);
      workspaceFromApiRef.current = false;
      setRtCleanerId(null);
      setRtTeamIds([]);
      if (!silent) setLoading(false);
      return;
    }
    const fetchProfile = !workspaceFromApiRef.current;
    const jobsPromise = cleanerAuthenticatedFetch("/api/cleaner/jobs?view=card", { headers });
    const offersPromise = cleanerAuthenticatedFetch("/api/cleaner/offers", { headers, cache: "no-store" });
    const mePromise = fetchProfile ? cleanerAuthenticatedFetch("/api/cleaner/me", { headers }) : null;
    const [res, offersRes] = await Promise.all([jobsPromise, offersPromise]);
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
    /** Soft-fail: if `/api/cleaner/offers` is unavailable (network / 5xx) keep the count at 0 — banner just hides. */
    try {
      const offersJson = (await offersRes.json().catch(() => ({}))) as { offers?: unknown };
      const arr = Array.isArray(offersJson.offers) ? offersJson.offers : [];
      setPendingOfferCount(offersRes.ok ? arr.length : 0);
    } catch {
      setPendingOfferCount(0);
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
    // M-10: opt in to `dispatch_offers` events so the pending-offer count
    // badge above the jobs list updates immediately on new dispatcher
    // INSERTs (no waiting on the 25s poll tick) and clears immediately when
    // an accept/decline/expire UPDATE flips the offer out of the
    // pending-visibility set. Same `bumpJobsFromRealtime` sink — `loadJobs`
    // refetches both `/api/cleaner/jobs` AND `/api/cleaner/offers`, so the
    // API is the canonical de-dup point regardless of whether a duplicate
    // Realtime event came in (debounced upstream into one refetch anyway).
    onOffersChange: bumpJobsFromRealtime,
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
  const upcomingForFilter = useMemo(() => {
    if (filter === "active") return upcomingRaw.filter((r) => isActiveCleanerJobRow(r));
    return upcomingRaw;
  }, [filter, upcomingRaw]);
  const upcomingSorted = useMemo(() => sortUpcomingJobsAsc(upcomingForFilter), [upcomingForFilter]);

  useEffect(() => {
    const ms = jobsListAdaptivePollMs(upcomingRaw, nowTick);
    const id = window.setTimeout(() => setNowTick(Date.now()), ms);
    return () => window.clearTimeout(id);
  }, [nowTick, upcomingRaw]);

  const pastRaw = useMemo(() => rows.filter((r) => isPastCleanerJobRow(r)), [rows]);

  const pastForFilter = useMemo(() => {
    if (filter === "completed") return pastRaw.filter((r) => isCompletedCleanerJobRow(r));
    if (filter === "cancelled") return pastRaw.filter((r) => isCancelledCleanerJobRow(r));
    return pastRaw;
  }, [filter, pastRaw]);

  const pastGrouped = useMemo(() => groupRowsByBookingDateDesc(pastForFilter), [pastForFilter]);

  // Active = open jobs the cleaner is currently driving to or executing.
  // Lives in the upper section of the list because it ranks above Upcoming.
  const showUpcoming = filter === "all" || filter === "upcoming" || filter === "active";
  const showPast = filter === "all" || filter === "completed" || filter === "cancelled";

  const upcomingHeading = filter === "active" ? "Active" : "Upcoming";
  const pastHeading = filter === "completed" ? "Completed" : filter === "cancelled" ? "Cancelled" : "Past jobs";

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

      {!loading ? <PendingOffersBanner pendingOfferCount={pendingOfferCount} /> : null}

      {!loading && !err ? (
        <div className="-mx-4 overflow-x-auto px-4" role="tablist" aria-label="Job filters">
          <div className="flex min-w-max gap-2 pb-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={tabClass(filter === tab.id)}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          {pendingOfferCount > 0 ? (
            <>
              <p className="font-medium text-foreground">No assigned jobs yet</p>
              <p className="mt-2">
                You have {pendingOfferCount === 1 ? "an offer" : `${pendingOfferCount} offers`} waiting — open your{" "}
                <Link href="/cleaner/dashboard" className="font-semibold text-emerald-700 underline dark:text-emerald-300">
                  dashboard
                </Link>{" "}
                to respond.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">No jobs available right now</p>
              <p className="mt-2">Stay online — we&apos;ll send jobs when available.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {showUpcoming ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                {upcomingHeading}
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
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{pastHeading}</h2>
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
