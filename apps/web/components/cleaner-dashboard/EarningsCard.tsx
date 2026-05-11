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

/**
 * Compact "Today" earnings card — operational cockpit variant.
 *
 * Glance answer: "How much did I earn today + how close to goal?"
 * Render budget: ~110–130px tall on mobile.
 *
 * Notes:
 *  - The amount stays the strongest typographic element on the dashboard
 *    (`text-3xl`, font-extrabold) — the user's spec calls out earnings as a
 *    primary visual hierarchy element.
 *  - Padding tightened to `p-3` and the goal line collapses to a single
 *    row ("63% of R… goal · Details →") so the card no longer feels like
 *    an oversized black slab.
 */
export function EarningsCard({ earnings, embedded }: EarningsCardProps) {
  const [open, setOpen] = useState(false);
  const hasBreakdown = earnings.todayBreakdown.length > 0;

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
        "bg-zinc-950 text-white dark:bg-zinc-900",
        embedded ? "rounded-xl p-3 shadow-inner" : "rounded-xl p-3 shadow-sm transition-shadow duration-200 hover:shadow-md",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/cleaner/earnings"
          className="min-w-0 flex-1 rounded-md outline-none ring-offset-background transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/40 active:opacity-90"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Today</p>
          <p className="mt-0.5 text-3xl font-extrabold leading-none tabular-nums tracking-tight">
            {earnings.todayZarLabel}
          </p>
        </Link>
        {hasBreakdown ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Hide today's earnings breakdown" : "Show today's earnings breakdown"}
          >
            {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
          </Button>
        ) : null}
      </div>
      {showGoal ? (
        <div className="mt-2.5">
          <div
            className="h-1 overflow-hidden rounded-full bg-white/15"
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
          <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-white/55 tabular-nums">
            <span>
              {progress}% of {formatZarFromCents(goal)} goal
            </span>
            <Link
              href="/cleaner/earnings"
              className="font-medium text-white/70 underline-offset-2 hover:text-white hover:underline"
            >
              Details →
            </Link>
          </div>
        </div>
      ) : null}
      {open && hasBreakdown ? (
        <ul className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-sm">
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
