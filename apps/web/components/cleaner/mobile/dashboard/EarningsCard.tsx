"use client";

import { DollarSign } from "lucide-react";

type Props = {
  /** Today’s potential / scheduled earnings (ZAR). */
  earningsToday: number;
  /** Completed week-to-date (ZAR), before adding today. */
  weekEarnedZar: number;
  /** Adaptive weekly goal (ZAR), floored at 1000 upstream. */
  weeklyGoalZar: number;
  hasGap?: boolean;
};

export function EarningsCard({ earningsToday, weekEarnedZar, weeklyGoalZar, hasGap = false }: Props) {
  const goal = Math.max(1000, Math.round(weeklyGoalZar));
  const today = Math.max(0, Math.round(earningsToday));
  const weekProgress = Math.max(0, Math.round(weekEarnedZar)) + today;
  const pctRaw = goal > 0 ? (weekProgress / goal) * 100 : 0;
  const pct = Math.min(100, Math.max(0, Math.round(pctRaw)));

  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white shadow-sm ring-1 ring-white/10 dark:from-blue-700 dark:to-indigo-800">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">Today&apos;s earnings</p>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white"
          aria-hidden
        >
          <DollarSign className="h-5 w-5 stroke-[2.5]" />
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-white">
        {today > 0 ? `R${today.toLocaleString("en-ZA")}` : "—"}
      </p>
      <div className="mt-5 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-white/95">Weekly goal</span>
        <span className="shrink-0 font-bold tabular-nums text-white">
          R{weekProgress.toLocaleString("en-ZA")} / R{goal.toLocaleString("en-ZA")}
        </span>
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-white transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-white/80">
        {weekProgress >= goal
          ? `Goal reached — R${goal.toLocaleString("en-ZA")} this week`
          : `${pct}% of R${goal.toLocaleString("en-ZA")} goal reached`}
      </p>
      {hasGap ? (
        <p className="mt-3 border-t border-white/20 pt-3 text-xs leading-snug text-white/70">
          Some jobs don&apos;t have pay shown yet — progress may be understated.
        </p>
      ) : null}
    </div>
  );
}
