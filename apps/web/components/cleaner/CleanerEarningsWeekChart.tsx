"use client";

import type { EarningsDayPoint } from "@/lib/cleaner/earningsInsightsSeries";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

const W = 280;
const H = 96;
const PAD = 8;

export function CleanerEarningsWeekChart({ points }: { points: EarningsDayPoint[] }) {
  const maxC = Math.max(1, ...points.map((p) => p.cents));
  const coords = points.map((p, i) => {
    const x = PAD + (i / Math.max(1, points.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - (p.cents / maxC) * (H - 2 * PAD);
    return { x, y, cents: p.cents, label: p.label };
  });
  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Last 7 days</p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Completed-job earnings by day</p>
      <div className="mt-3 overflow-x-auto">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto block text-emerald-600 dark:text-emerald-400"
          aria-label="Earnings trend for the last seven days"
        >
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth={1} />
          <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={c.cents > 0 ? 3.5 : 2} className="fill-current" />
          ))}
        </svg>
      </div>
      <div className="mt-2 flex justify-between gap-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
        {points.map((p) => (
          <span key={p.ymd} className="min-w-0 flex-1 truncate text-center" title={`${p.ymd}: ${formatZarFromCents(p.cents)}`}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
