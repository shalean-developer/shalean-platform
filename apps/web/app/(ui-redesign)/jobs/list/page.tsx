"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JobCard } from "@/components/cleaner/JobCard";
import { PendingOffersBanner } from "@/components/cleaner-jobs/PendingOffersBanner";
import { useCleanerNavBadges } from "@/components/cleaner-dashboard/CleanerNavBadgesContext";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import {
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

type FilterTab = "upcoming" | "today" | "completed" | "cancelled";

const FILTER_TABS: ReadonlyArray<{ id: FilterTab; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "today", label: "Today" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function isToday(row: CleanerBookingRow, now: Date): boolean {
  const dateStr = String(row.date ?? "").trim();
  if (!dateStr) return false;
  const heading = jobDateHeading(dateStr, now);
  return heading.toLowerCase() === "today";
}

export default function JobsListPage() {
  const { setOpenJobsCount, setPendingOffersCount } = useCleanerNavBadges();
  const { loading: userLoading } = useUser();
  const [rows, setRows] = useState<CleanerBookingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("upcoming");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [ttlLockEpoch, setTtlLockEpoch] = useState(0);
  const [jobsRealtimeTick, setJobsRealtimeTick] = useState(0);
  const [rtCleanerId, setRtCleanerId] = useState<string | null>(null);
  const [rtTeamIds, setRtTeamIds] = useState<string[]>([]);
  const workspaceFromApiRef = useRef(false);
  const [pendingOfferCount, setPendingOfferCount] = useState(0);
  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const openCount = useMemo(() => rows.filter((r) => isOpenCleanerJobRow(r)).length, [rows]);

  const patchJobRow = useCallback((bookingId: string, patch: Partial<CleanerBookingRow>) => {
    const bid = bookingId.trim();
    if (!bid) return;
    setRows((prev) => prev.map((r) => (r.id === bid ? ({ ...r, ...patch } as CleanerBookingRow) : r)));
  }, []);

  useEffect(() => { if (!loading) setOpenJobsCount(openCount); }, [loading, openCount, setOpenJobsCount]);
  useEffect(() => { if (!loading) setPendingOffersCount(pendingOfferCount); }, [loading, pendingOfferCount, setPendingOffersCount]);

  const loadJobs = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) { setLoading(true); setErr(null); }
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setErr("Not signed in."); setRows([]); setPendingOfferCount(0);
      workspaceFromApiRef.current = false; setRtCleanerId(null); setRtTeamIds([]);
      if (!silent) setLoading(false);
      return;
    }
    const fetchProfile = !workspaceFromApiRef.current;
    const [res, offersRes] = await Promise.all([
      cleanerAuthenticatedFetch("/api/cleaner/jobs?view=card", { headers }),
      cleanerAuthenticatedFetch("/api/cleaner/offers", { headers, cache: "no-store" }),
    ]);
    if (fetchProfile) {
      const meRes = await cleanerAuthenticatedFetch("/api/cleaner/me", { headers });
      const m = (await meRes.json().catch(() => ({}))) as { cleaner?: { id?: string }; teamIds?: unknown };
      if (meRes.ok && typeof m.cleaner?.id === "string") {
        const cid = m.cleaner.id.trim();
        if (cid) {
          workspaceFromApiRef.current = true; setRtCleanerId(cid);
          const tis = Array.isArray(m.teamIds) ? m.teamIds.filter((x): x is string => typeof x === "string" && Boolean(x)).map(String) : [];
          setRtTeamIds(tis);
        }
      }
    }
    const j = (await res.json().catch(() => ({}))) as { jobs?: CleanerBookingRow[]; error?: string };
    if (!res.ok) { setErr(j.error ?? "Could not load jobs."); setRows([]); }
    else { setErr(null); setRows(Array.isArray(j.jobs) ? j.jobs : []); }
    try {
      const offersJson = (await offersRes.json().catch(() => ({}))) as { offers?: unknown };
      const arr = Array.isArray(offersJson.offers) ? offersJson.offers : [];
      setPendingOfferCount(offersRes.ok ? arr.length : 0);
    } catch { setPendingOfferCount(0); }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { if (!userLoading) void loadJobs({ silent: jobsRealtimeTick > 0 }); }, [userLoading, loadJobs, jobsRealtimeTick]);

  useEffect(() => {
    const fn = () => void loadJobs({ silent: true });
    window.addEventListener(CLEANER_DASHBOARD_JOBS_REFRESH_EVENT, fn);
    return () => window.removeEventListener(CLEANER_DASHBOARD_JOBS_REFRESH_EVENT, fn);
  }, [loadJobs]);

  const bumpRealtime = useCallback(() => setJobsRealtimeTick((n) => n + 1), []);
  useCleanerRealtime({ cleanerId: userLoading ? undefined : rtCleanerId ?? undefined, debounceMs: 300, subscribeBookings: true, subscribeWorkSettings: false, workspaceBookingsRealtime: true, workspaceTeamIds: rtTeamIds, onBookingChange: bumpRealtime, onOffersChange: bumpRealtime });

  useEffect(() => {
    let deb: number | null = null;
    const bump = () => { if (deb != null) window.clearTimeout(deb); deb = window.setTimeout(() => { deb = null; setTtlLockEpoch((n) => n + 1); }, 150); };
    window.addEventListener("cleaner-ttl-complete-lock", bump);
    const onStorage = (e: StorageEvent) => { if (e.key === CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY) bump(); };
    window.addEventListener("storage", onStorage);
    const unsubBc = subscribeTtlCompleteLockBroadcast(() => bump());
    return () => { if (deb != null) window.clearTimeout(deb); window.removeEventListener("cleaner-ttl-complete-lock", bump); window.removeEventListener("storage", onStorage); unsubBc(); };
  }, []);

  const ttlCompleteLock = useMemo(() => { void ttlLockEpoch; void nowTick; return readTtlCompleteSyncLockFromSession(); }, [ttlLockEpoch, nowTick]);
  const upcomingRaw = useMemo(() => rows.filter((r) => isOpenCleanerJobRow(r)), [rows]);

  useEffect(() => {
    const ms = jobsListAdaptivePollMs(upcomingRaw, nowTick);
    const id = window.setTimeout(() => setNowTick(Date.now()), ms);
    return () => window.clearTimeout(id);
  }, [nowTick, upcomingRaw]);

  // Derive lists per tab
  const todayRows = useMemo(() => upcomingRaw.filter((r) => isToday(r, now)), [upcomingRaw, now]);
  const completedRows = useMemo(
    () => rows.filter((r) => isPastCleanerJobRow(r) && isCompletedCleanerJobRow(r)),
    [rows],
  );
  const cancelledRows = useMemo(
    () => rows.filter((r) => isPastCleanerJobRow(r) && isCancelledCleanerJobRow(r)),
    [rows],
  );

  const currentList = useMemo(() => {
    switch (filter) {
      case "today": return sortUpcomingJobsAsc(todayRows);
      case "completed": return completedRows;
      case "cancelled": return cancelledRows;
      default: return sortUpcomingJobsAsc(upcomingRaw);
    }
  }, [filter, upcomingRaw, todayRows, completedRows, cancelledRows]);

  const isPast = filter === "completed" || filter === "cancelled";

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-6 space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your jobs</h1>
        <p className="mt-0.5 text-sm text-slate-400">Upcoming and past bookings.</p>
      </div>

      {/* TTL complete lock warning */}
      {ttlCompleteLock ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <p className="font-semibold">Confirm your last job on its page</p>
          <p className="mt-1 text-xs opacity-90">A completion may not have reached the server before it expired. Open that job and use <strong>Refresh details</strong> before completing again.</p>
        </div>
      ) : null}

      {/* Pending offers banner */}
      {!loading ? <PendingOffersBanner pendingOfferCount={pendingOfferCount} /> : null}

      {/* Filter tabs */}
      {!loading && !err ? (
        <div className="-mx-4 overflow-x-auto px-4" role="tablist">
          <div className="flex min-w-max gap-2 pb-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={cn(
                  "h-9 rounded-full border px-4 text-sm font-medium transition-colors",
                  filter === tab.id
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-200 bg-white text-slate-500 hover:border-gray-300 hover:text-slate-700",
                )}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
                {tab.id === "upcoming" && upcomingRaw.length > 0 ? (
                  <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                    filter === "upcoming" ? "bg-white/20 text-white" : "bg-blue-50 text-blue-700"
                  )}>
                    {upcomingRaw.length}
                  </span>
                ) : null}
                {tab.id === "today" && todayRows.length > 0 ? (
                  <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                    filter === "today" ? "bg-white/20 text-white" : "bg-blue-50 text-blue-700"
                  )}>
                    {todayRows.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      ) : err ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : currentList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center">
          {filter === "upcoming" && pendingOfferCount > 0 ? (
            <>
              <p className="font-semibold text-slate-800">No assigned jobs yet</p>
              <p className="mt-2 text-sm text-slate-400">
                You have {pendingOfferCount === 1 ? "an offer" : `${pendingOfferCount} offers`} waiting — check your home screen.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-800">
                {filter === "completed" ? "No completed jobs yet" :
                  filter === "cancelled" ? "No cancelled jobs" :
                  filter === "today" ? "No jobs scheduled today" :
                  "No upcoming jobs"}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {filter === "upcoming" || filter === "today"
                  ? "Stay online — we'll send jobs when available."
                  : "They'll appear here once they exist."}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {currentList.map((row) => (
            <JobCard
              key={row.id}
              row={row}
              variant={isPast ? "past" : "upcoming"}
              now={now}
              onRowPatched={patchJobRow}
              onRefresh={() => void loadJobs({ silent: true })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
