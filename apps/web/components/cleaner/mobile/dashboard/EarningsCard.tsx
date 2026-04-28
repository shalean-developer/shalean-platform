"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY, cleanerBankDetailsPromptWithEligible } from "@/lib/cleaner/cleanerPayoutCopy";
import { formatZarFromCents, formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";

function useAnimatedCents(target: number, durationMs = 420) {
  const [value, setValue] = useState(() => Math.max(0, Math.round(target)));
  const prevRef = useRef(Math.max(0, Math.round(target)));

  useEffect(() => {
    const from = prevRef.current;
    const to = Math.max(0, Math.round(target));
    if (from === to) {
      setValue(to);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - p) * (1 - p);
      setValue(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        setValue(to);
        prevRef.current = to;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

export function EarningsCard({
  loading,
  eligibleCents,
  todayZar,
  weekZar,
  monthZar,
  hasGap = false,
  missingBankDetails = false,
  onViewEarnings,
}: {
  loading: boolean;
  eligibleCents: number;
  todayZar: number;
  weekZar: number;
  monthZar: number;
  hasGap?: boolean;
  missingBankDetails?: boolean;
  onViewEarnings: () => void;
}) {
  const eligible = Math.max(0, Math.round(eligibleCents));
  const animated = useAnimatedCents(eligible);
  const today = Math.max(0, Math.round(todayZar));
  const week = Math.max(0, Math.round(weekZar));
  const month = Math.max(0, Math.round(monthZar));

  if (loading) {
    return (
      <div
        className="space-y-4 rounded-2xl border-2 border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/70 p-5 shadow-md dark:border-emerald-800/60 dark:from-emerald-950/40 dark:via-zinc-900 dark:to-emerald-950/25"
        aria-hidden
      >
        <div className="h-4 w-24 animate-pulse rounded bg-emerald-200/60 dark:bg-emerald-800/50" />
        <div className="h-10 w-40 animate-pulse rounded bg-emerald-100/80 dark:bg-emerald-900/40" />
        <div className="grid grid-cols-3 gap-2 border-t border-emerald-200/50 pt-4 dark:border-emerald-800/40">
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-12 animate-pulse rounded-lg bg-white/60 dark:bg-zinc-800/60" />
          ))}
        </div>
        <div className="h-11 animate-pulse rounded-xl bg-emerald-200/50 dark:bg-emerald-800/40" />
      </div>
    );
  }

  return (
    <section
      className="rounded-2xl border-2 border-emerald-300/70 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/80 p-5 shadow-md dark:border-emerald-700/50 dark:from-emerald-950/45 dark:via-zinc-900 dark:to-emerald-950/30"
      aria-label="Earnings"
    >
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-200">Earnings</h2>
      <p className="mt-1 text-[11px] font-medium text-emerald-900/80 dark:text-emerald-200/90">Available to be paid</p>
      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-emerald-950 dark:text-emerald-50">
        {formatZarFromCents(animated)}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-emerald-200/60 pt-4 text-[11px] dark:border-emerald-800/50">
        <div>
          <p className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Today</p>
          <p className="mt-0.5 tabular-nums text-sm font-bold text-zinc-900 dark:text-zinc-50">{formatZarWhole(today)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">This week</p>
          <p className="mt-0.5 tabular-nums text-sm font-bold text-zinc-900 dark:text-zinc-50">{formatZarWhole(week)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">This month</p>
          <p className="mt-0.5 tabular-nums text-sm font-bold text-zinc-900 dark:text-zinc-50">{formatZarWhole(month)}</p>
        </div>
      </div>

      {hasGap ? (
        <p className="mt-3 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
          Some jobs don&apos;t have pay shown yet — totals may be understated until amounts are confirmed.
        </p>
      ) : null}

      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={onViewEarnings}
          className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          View earnings
        </button>
        {missingBankDetails ? (
          <div className="space-y-1.5 text-center">
            <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
              {eligible > 0 ? cleanerBankDetailsPromptWithEligible(eligible) : CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY}
            </p>
            <Link
              href="/cleaner/settings/payment"
              className="block text-xs font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
            >
              Add now
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
