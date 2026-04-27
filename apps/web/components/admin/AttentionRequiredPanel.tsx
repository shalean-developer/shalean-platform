"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useOpsSnapshot } from "@/hooks/useOpsSnapshot";
import { AttentionCard } from "@/components/admin/AttentionCard";

function AttentionSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="h-[140px] animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-800/50" />
        <div className="h-[140px] animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-800/50" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-[120px] animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-800/50" />
        <div className="h-[120px] animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-800/50" />
      </div>
    </div>
  );
}

function withOpenAssign(viewPath: string): string {
  const u = new URL(viewPath, "https://placeholder.local");
  u.searchParams.set("openAssign", "1");
  return `${u.pathname}${u.search}`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatRelativeShort(fromMs: number): string {
  const s = Math.max(0, Math.floor((Date.now() - fromMs) / 1000));
  if (s < 50) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function formatPendingSinceTooltip(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return `Pending since: ${new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

const EMPTY_SNAPSHOT = {
  unassignable: 0,
  slaBreaches: 0,
  oldestBreachMinutes: 0,
  slaBreachesOverdueGt30: 0,
  slaBreachesOverdueGt10Le30: 0,
  slaWorstBreachPendingSinceIso: null as string | null,
  unassigned: 0,
  startingSoon: 0,
  startingSoonNextMinutes: null as number | null,
};

export function AttentionRequiredPanel() {
  const getToken = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const session = await sb?.auth.getSession();
    return session?.data.session?.access_token ?? null;
  }, []);

  const { status, data, error, refetch, lastUpdatedMs, trendHints, lastSlaWorseningAt, slaPulseSignal } =
    useOpsSnapshot(getToken);

  const slaFocusRef = useRef<HTMLDivElement | null>(null);
  const didScrollSla = useRef(false);
  const [slaPulse, setSlaPulse] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;

    let ch: ReturnType<typeof sb.channel> | null = null;
    const connect = () => {
      ch = sb
        .channel("admin-ops-snapshot")
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
          void refetch();
        })
        .subscribe();
    };

    if (!document.hidden) connect();

    const onVis = () => {
      if (document.hidden) {
        if (ch) void sb.removeChannel(ch);
        ch = null;
        return;
      }
      if (!ch) {
        connect();
        void refetch();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (ch) void sb.removeChannel(ch);
    };
  }, [refetch]);

  const snap = useMemo(() => data ?? EMPTY_SNAPSHOT, [data]);

  const allClear =
    snap.unassignable + snap.slaBreaches + snap.unassigned + snap.startingSoon === 0 && status === "ok";

  useEffect(() => {
    if (slaPulseSignal === 0) return;
    setSlaPulse(true);
    const t = window.setTimeout(() => setSlaPulse(false), 2000);
    return () => window.clearTimeout(t);
  }, [slaPulseSignal]);

  useEffect(() => {
    if (snap.slaBreaches === 0) {
      didScrollSla.current = false;
      return;
    }
    if (slaPulseSignal === 0) return;
    if (didScrollSla.current) return;
    didScrollSla.current = true;
    requestAnimationFrame(() => {
      slaFocusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [slaPulseSignal, snap.slaBreaches]);

  if (status === "loading" && !data) {
    return (
      <section className="mb-8 space-y-3" aria-busy="true" aria-label="Loading attention metrics">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Attention required</h2>
        </div>
        <AttentionSkeleton />
      </section>
    );
  }

  if (status === "error" && !data) {
    return (
      <section className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
        <p className="font-medium">Could not load ops snapshot</p>
        <p className="mt-1 text-rose-800/90 dark:text-rose-200/90">{error}</p>
      </section>
    );
  }

  const updatedLine =
    lastUpdatedMs != null ? (
      <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">Last updated: {formatTime(lastUpdatedMs)}</p>
    ) : null;

  const lastIncidentLine =
    lastSlaWorseningAt != null ? (
      <p className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
        Last SLA worsening: {formatRelativeShort(lastSlaWorseningAt)}
      </p>
    ) : null;

  if (allClear) {
    return (
      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Attention required</h2>
          {updatedLine}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200/90 bg-emerald-50/95 px-5 py-6 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/35">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div>
              <p className="text-lg font-semibold text-emerald-950 dark:text-emerald-50">All operations running smoothly</p>
              <p className="mt-1 text-sm text-emerald-900/90 dark:text-emerald-100/90">
                No bookings need attention right now.
              </p>
            </div>
          </div>
          {error ? <p className="text-xs text-amber-800 dark:text-amber-300">{error}</p> : null}
        </div>
      </section>
    );
  }

  const slaView = "/admin/ops/sla-breaches";
  const unassignView = "/admin/bookings?filter=unassignable";
  const unassignedView = "/admin/bookings?filter=unassigned";
  const soonView = "/admin/bookings?filter=starting-soon";

  const slaDetail =
    snap.slaBreaches > 0
      ? snap.oldestBreachMinutes > 0
        ? `${snap.slaBreaches} breach${snap.slaBreaches === 1 ? "" : "es"} · oldest overdue ${snap.oldestBreachMinutes}m`
        : `${snap.slaBreaches} breach${snap.slaBreaches === 1 ? "" : "es"} · oldest just crossed SLA`
      : null;

  const slaSecondaryLines: string[] = [];
  if (snap.slaBreaches > 0) {
    if (snap.slaBreachesOverdueGt30 > 0) {
      slaSecondaryLines.push(`• ${snap.slaBreachesOverdueGt30} > 30m overdue`);
    }
    if (snap.slaBreachesOverdueGt10Le30 > 0) {
      slaSecondaryLines.push(`• ${snap.slaBreachesOverdueGt10Le30} > 10m overdue (≤30m)`);
    }
  }

  const slaPendingTooltip = formatPendingSinceTooltip(snap.slaWorstBreachPendingSinceIso);

  const soonDetail =
    snap.startingSoon > 0 ? `${snap.startingSoon} job${snap.startingSoon === 1 ? "" : "s"}` : null;
  const soonSecondary =
    snap.startingSoon > 0 && snap.startingSoonNextMinutes != null
      ? [`• Next in ${snap.startingSoonNextMinutes}m`]
      : [];

  return (
    <section className="mb-8 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Attention required</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Priority order: SLA breach → Unassignable → Unassigned (paid) → Starting soon.
            {" · "}
            <Link
              href="/admin/bookings?filter=follow-up"
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Needs follow-up
            </Link>
          </p>
          {lastIncidentLine}
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          {error ? <p className="text-xs text-amber-700 dark:text-amber-400">{error}</p> : null}
          {updatedLine}
        </div>
      </div>

      <div ref={slaFocusRef} className="space-y-3">
        {snap.slaBreaches > 0 ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-red-300/90 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-950 shadow-sm dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-50"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <span>SLA breaches need attention — act on the oldest queue first.</span>
          </div>
        ) : null}

        {snap.unassignable > 0 ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-amber-300/90 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950 shadow-sm dark:border-amber-900/55 dark:bg-amber-950/45 dark:text-amber-50"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
            <span>No cleaner available — manual action required (dispatch exhausted).</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AttentionCard
            title="SLA breaches"
            count={snap.slaBreaches}
            severity="critical"
            viewHref={slaView}
            assignHref={withOpenAssign(slaView)}
            detailLine={slaDetail ?? undefined}
            secondaryLines={slaSecondaryLines.length ? slaSecondaryLines : undefined}
            detailTooltip={slaPendingTooltip}
            emphasized={snap.slaBreaches > 0}
            pulseHighlight={slaPulse}
            trendHint={trendHints.sla}
            tier="primary"
          />
          <AttentionCard
            title="Unassignable"
            count={snap.unassignable}
            severity="critical"
            viewHref={unassignView}
            assignHref={withOpenAssign(unassignView)}
            detailLine={snap.unassignable > 0 ? `${snap.unassignable} booking${snap.unassignable === 1 ? "" : "s"}` : null}
            trendHint={trendHints.unassignable}
            tier="primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AttentionCard
          title="Unassigned (paid)"
          count={snap.unassigned}
          severity="warning"
          viewHref={unassignedView}
          assignHref={withOpenAssign(unassignedView)}
          detailLine={snap.unassigned > 0 ? `${snap.unassigned} booking${snap.unassigned === 1 ? "" : "s"}` : null}
          trendHint={trendHints.unassigned}
          tier="secondary"
        />
        <AttentionCard
          title="Starts < 2h, no cleaner"
          count={snap.startingSoon}
          severity="normal"
          viewHref={soonView}
          assignHref={withOpenAssign(soonView)}
          detailLine={soonDetail ?? undefined}
          secondaryLines={soonSecondary.length ? soonSecondary : undefined}
          trendHint={trendHints.startingSoon}
          tier="secondary"
        />
      </div>
    </section>
  );
}
