"use client";

import Link from "next/link";
import type { CleanerPerfRow } from "@/lib/admin/cleanerPerformance";

function scoreBadgeClass(score: number): string {
  if (score > 80) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  if (score >= 60) return "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100";
  return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100";
}

function rowTint(score: number): string {
  if (score > 80) return "bg-emerald-50/50 dark:bg-emerald-950/10";
  if (score >= 60) return "bg-amber-50/40 dark:bg-amber-950/10";
  return "bg-rose-50/40 dark:bg-rose-950/10";
}

export function CleanerPerformanceTable({ rows }: { rows: CleanerPerfRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        No cleaners match this filter for the selected window.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <table className="min-w-[1020px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
            <th className="px-3 py-3">Cleaner</th>
            <th className="px-3 py-3">Jobs completed</th>
            <th className="px-3 py-3">On-time %</th>
            <th className="px-3 py-3">Avg lateness (min)</th>
            <th className="px-3 py-3">Completion rate</th>
            <th className="px-3 py-3">Avg duration (min)</th>
            <th className="px-3 py-3">Reliability</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const onPct = r.punctualityJobs > 0 ? Math.round(r.onTimeRate * 1000) / 10 : null;
            const compPct = r.completionDenominator > 0 ? Math.round(r.completionRate * 1000) / 10 : null;
            return (
              <tr
                key={r.cleanerId}
                className={`border-b border-zinc-100 dark:border-zinc-800/80 ${rowTint(r.reliabilityScore)}`}
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">{r.cleanerName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                    <span className="font-mono text-zinc-400">{r.cleanerId.slice(0, 8)}…</span>
                    {r.lowSample ? (
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                        Low sample
                      </span>
                    ) : null}
                    <Link
                      href="/admin/cleaners"
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Roster
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-800 dark:text-zinc-200">{r.jobsCompleted}</td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-800 dark:text-zinc-200">
                  {onPct != null ? `${onPct}%` : "—"}
                  <div className="text-[11px] font-normal text-zinc-500">n={r.punctualityJobs}</div>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-800 dark:text-zinc-200">{r.avgLateMinutes}</td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-800 dark:text-zinc-200">
                  {compPct != null ? `${compPct}%` : "—"}
                  <div className="text-[11px] font-normal text-zinc-500">n={r.completionDenominator}</div>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-800 dark:text-zinc-200">
                  {r.avgJobDurationMinutes > 0 ? r.avgJobDurationMinutes : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex min-w-[3rem] justify-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${scoreBadgeClass(r.reliabilityScore)}`}
                  >
                    {r.reliabilityScore}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
