"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CleanerEarningsSnapshot } from "./types";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EarningsCardProps = {
  earnings: CleanerEarningsSnapshot;
  embedded?: boolean;
};

export function EarningsCard({ earnings, embedded }: EarningsCardProps) {
  const [open, setOpen] = useState(false);
  const hasBreakdown = earnings.todayBreakdown.length > 0;
  const showPotential =
    earnings.showZeroEarningsHint &&
    !hasBreakdown &&
    (Boolean(earnings.potentialRangeZarLabel) || Boolean(earnings.potentialNextJobZarLabel));

  const cents = earnings.todayCentsValue;
  const goal = earnings.dailyGoalCents;
  const progress =
    typeof cents === "number" && Number.isFinite(cents) && goal > 0 ? Math.min(100, Math.round((cents / goal) * 100)) : 0;
  const showGoal = typeof cents === "number" && cents >= 0 && goal > 0;

  return (
    <div
      className={cn(
        "bg-zinc-950 text-white dark:bg-zinc-900",
        embedded ? "rounded-xl p-4 shadow-inner" : "rounded-2xl p-5 shadow-md transition-shadow duration-200 hover:shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href="/cleaner/earnings"
          className="min-w-0 flex-1 rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/40 active:opacity-90"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-white/55">Today</p>
          <p className="mt-1 text-4xl font-extrabold leading-none tabular-nums tracking-tight">
            {earnings.todayZarLabel}
          </p>
          {showGoal ? (
            <div className="mt-3 max-w-[320px]">
              <div className="flex justify-between text-xs text-white/55">
                <span>Progress</span>
                <span className="tabular-nums">
                  {formatZarFromCents(cents)} / {formatZarFromCents(goal)}
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress toward daily goal"
              >
                <div
                  className="h-full rounded-full bg-emerald-400/90 transition-[width] duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {progress > 0 && progress < 100 ? (
                <p className="mt-1.5 text-xs text-white/50">You&apos;re {progress}% toward today&apos;s goal.</p>
              ) : null}
            </div>
          ) : null}
          {showPotential && earnings.potentialRangeZarLabel ? (
            <p className="mt-3 max-w-[320px] text-sm font-semibold leading-snug text-white/95">
              Today potential: {earnings.potentialRangeZarLabel}
            </p>
          ) : null}
          {showPotential && earnings.potentialNextJobZarLabel ? (
            <p className="mt-3 max-w-[320px] text-sm font-semibold leading-snug text-white/95">
              Complete your next job and earn ~{earnings.potentialNextJobZarLabel}
            </p>
          ) : null}
          {earnings.earningsMotivationLine ? (
            <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-white/70">{earnings.earningsMotivationLine}</p>
          ) : null}
          {earnings.earningsForwardLine ? (
            <p className="mt-2 max-w-[300px] text-sm font-medium leading-relaxed text-white/80">{earnings.earningsForwardLine}</p>
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-white/45">
            Earnings calculated in South African time (SAST).
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/40">Earnings update after job completion.</p>
          <p className="mt-2 text-xs text-white/40 underline-offset-2">Tap for full earnings →</p>
        </Link>
        {hasBreakdown ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 h-11 shrink-0 gap-1 text-white transition-colors duration-200 hover:bg-white/10 hover:text-white active:scale-95"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? (
              <>
                Hide <ChevronUp className="size-4" aria-hidden />
              </>
            ) : (
              <>
                Details <ChevronDown className="size-4" aria-hidden />
              </>
            )}
          </Button>
        ) : null}
      </div>
      {open && hasBreakdown ? (
        <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
          {earnings.todayBreakdown.map((line) => (
            <li key={line.booking_id} className="flex justify-between gap-3 text-white/90">
              <span className="min-w-0 truncate">{line.label}</span>
              <span className="shrink-0 tabular-nums font-medium">{formatZarFromCents(line.cents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
