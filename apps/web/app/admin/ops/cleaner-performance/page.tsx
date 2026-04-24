"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { CleanerPerformanceTable } from "@/components/admin/CleanerPerformanceTable";
import type { CleanerPerfRow, FleetDayTrend } from "@/lib/admin/cleanerPerformance";

type FilterKey = "all" | "top" | "at_risk" | "most_late";

type ApiPayload = {
  cleaners?: CleanerPerfRow[];
  fleetTrend7d?: FleetDayTrend[];
  meta?: { days: number; fromYmd: string; bookingCount: number };
  error?: string;
};

const POLL_MS = 60_000;

export default function AdminCleanerPerformancePage() {
  const [rows, setRows] = useState<CleanerPerfRow[]>([]);
  const [trend, setTrend] = useState<FleetDayTrend[]>([]);
  const [meta, setMeta] = useState<{ days: number; fromYmd: string; bookingCount: number } | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setError("Please sign in as admin.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/cleaner-performance?days=120", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as ApiPayload;
    if (!res.ok) {
      setError(json.error ?? "Failed to load performance data.");
      setRows([]);
      setTrend([]);
      setMeta(null);
      setLoading(false);
      return;
    }
    setError(null);
    setRows(json.cleaners ?? []);
    setTrend(json.fleetTrend7d ?? []);
    setMeta(json.meta ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const visibleRows = useMemo(() => {
    let v = [...rows];
    if (filter === "top") {
      v = v.filter((c) => c.reliabilityScore >= 75 && c.jobsCompleted >= 2 && !c.lowSample);
      v.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    } else if (filter === "at_risk") {
      v = v.filter(
        (c) =>
          c.reliabilityScore < 60 ||
          (c.completionDenominator >= 2 && c.completionRate < 0.65) ||
          (c.punctualityJobs >= 3 && c.avgLateMinutes >= 18),
      );
      v.sort((a, b) => a.reliabilityScore - b.reliabilityScore);
    } else if (filter === "most_late") {
      v = v.filter((c) => c.punctualityJobs >= 1);
      v.sort((a, b) => b.avgLateMinutes - a.avgLateMinutes);
    }
    return v;
  }, [rows, filter]);

  const maxCompleted = useMemo(() => Math.max(1, ...trend.map((d) => d.completedJobs)), [trend]);

  return (
    <main className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Operations</p>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Cleaner performance</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Reliability from bookings with a cleaner: on-time start vs scheduled slot (Johannesburg +02:00 window),
          completion among finished jobs, and job length for completed cleans. Use this to steer dispatch and spot
          regressions early.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {meta ? (
            <>
              Window: last <span className="font-medium tabular-nums">{meta.days}</span> days from{" "}
              <span className="font-mono">{meta.fromYmd}</span> ·{" "}
              <span className="font-medium tabular-nums">{meta.bookingCount}</span> booking rows with cleaner
            </>
          ) : null}
          {" · "}
          <Link href="/admin/ops/sla-breaches" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            SLA queue
          </Link>
          {" · "}
          <Link href="/admin/cleaners" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Cleaner roster
          </Link>
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Fleet trend (last 7 days)</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          On-time % among <span className="font-medium">completed</span> jobs with a known slot and start time. Bar
          height = completed volume that day.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3 md:gap-4">
          {trend.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1">
              <div
                className="flex w-10 items-end justify-center rounded-md bg-zinc-100 dark:bg-zinc-800"
                style={{ height: 88 }}
              >
                <div
                  className="w-full rounded-md bg-emerald-500/90 dark:bg-emerald-600"
                  style={{ height: `${Math.max(6, (d.completedJobs / maxCompleted) * 88)}px` }}
                  title={`${d.completedJobs} completed`}
                />
              </div>
              <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{d.day.slice(5)}</p>
              <p className="text-xs font-bold tabular-nums text-zinc-800 dark:text-zinc-200">{d.onTimePct}%</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs font-medium text-zinc-500 dark:text-zinc-400">View</span>
          {(
            [
              ["all", "All cleaners"],
              ["top", "Top performers"],
              ["at_risk", "At risk"],
              ["most_late", "Most late"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                filter === key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          Score &gt; 80 <span className="text-emerald-600 dark:text-emerald-400">green</span> · 60–80{" "}
          <span className="text-amber-600 dark:text-amber-400">yellow</span> · &lt; 60{" "}
          <span className="text-rose-600 dark:text-rose-400">red</span>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-center text-sm text-zinc-500">Loading cleaner metrics…</p>
      ) : (
        <CleanerPerformanceTable rows={visibleRows} />
      )}

      <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">How scores are built</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed">
          <li>
            <span className="font-medium">On-time %</span>: jobs with start + scheduled slot where{" "}
            <code className="rounded bg-zinc-200 px-0.5 dark:bg-zinc-800">started_at ≤ slot</code>.
          </li>
          <li>
            <span className="font-medium">Avg lateness</span>: average of minutes late vs slot (0 if on time) across
            those jobs.
          </li>
          <li>
            <span className="font-medium">Completion rate</span>: completed ÷ (completed + cancelled + failed) with
            this cleaner.
          </li>
          <li>
            <span className="font-medium">Avg job duration</span>: mean <code className="rounded bg-zinc-200 px-0.5 dark:bg-zinc-800">completed_at − started_at</code>{" "}
            for completed jobs.
          </li>
          <li>
            <span className="font-medium">Reliability (0–100)</span>:{" "}
            <code className="rounded bg-zinc-200 px-0.5 dark:bg-zinc-800">0.4×on_time + 0.4×completion + 0.2×lateness_penalty</code>
            , where lateness penalty shrinks when average late minutes (among late jobs) exceeds ~45m.
          </li>
        </ul>
      </section>
    </main>
  );
}
