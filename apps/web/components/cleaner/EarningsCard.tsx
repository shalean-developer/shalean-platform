"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";
import type { CleanerEarningsSnapshot } from "@/components/cleaner-dashboard/types";

type EarningsCardProps = {
  earnings: CleanerEarningsSnapshot;
  className?: string;
};

export function CleanerEarningsCard({ earnings, className }: EarningsCardProps) {
  const cents = earnings.todayCentsValue;
  const goal = earnings.dailyGoalCents;
  const progress =
    typeof cents === "number" && Number.isFinite(cents) && goal > 0
      ? Math.min(100, Math.round((cents / goal) * 100))
      : 0;
  const showGoal = typeof cents === "number" && cents >= 0 && goal > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Today&apos;s Earnings
          </p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-slate-900">
            {earnings.todayZarLabel}
          </p>
          {showGoal ? (
            <p className="mt-1 text-xs text-slate-400 tabular-nums">
              {progress}% of {formatZarFromCents(goal)} goal
            </p>
          ) : null}
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50">
          <Wallet className="size-5 text-green-600" strokeWidth={1.75} aria-hidden />
        </div>
      </div>

      {showGoal ? (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress toward daily earnings goal"
          >
            <div
              className="h-full rounded-full bg-green-500 transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Link
          href="/jobs/earnings"
          className="text-xs font-semibold text-blue-600 underline-offset-2 hover:underline"
        >
          View details →
        </Link>
      </div>
    </div>
  );
}
