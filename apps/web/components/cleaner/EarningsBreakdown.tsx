"use client";

import Link from "next/link";
import { ChevronRight, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type EarningsPeriod = {
  label: string;
  value: string;
  sub?: string;
};

type PayoutItem = {
  id: string;
  label: string;
  amount: string;
  status: "pending" | "paid";
  dateLabel?: string;
};

type EarningsBreakdownProps = {
  today: EarningsPeriod;
  thisWeek: EarningsPeriod;
  thisMonth: EarningsPeriod;
  goalProgress?: number;
  goalLabel?: string;
  pendingPayout?: string;
  paidPayout?: string;
  bonusTotal?: string;
  payouts?: PayoutItem[];
  onViewPayout?: () => void;
  className?: string;
};

export function EarningsBreakdown({
  today,
  thisWeek,
  thisMonth,
  goalProgress,
  goalLabel,
  pendingPayout,
  paidPayout,
  bonusTotal,
  payouts = [],
  onViewPayout,
  className,
}: EarningsBreakdownProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[today, thisWeek, thisMonth].map((period) => (
          <div
            key={period.label}
            className="rounded-2xl border border-gray-100 bg-white px-3 py-3.5 shadow-sm text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              {period.label}
            </p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900 leading-none">
              {period.value}
            </p>
            {period.sub ? (
              <p className="mt-0.5 text-xs text-slate-400">{period.sub}</p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Goal progress */}
      {goalProgress != null && goalLabel ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold text-slate-700">Daily goal progress</p>
            <span className="text-sm font-bold tabular-nums text-green-600">
              {goalProgress}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuenow={goalProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-green-500 transition-[width] duration-500"
              style={{ width: `${Math.min(100, goalProgress)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">{goalLabel}</p>
        </div>
      ) : null}

      {/* Payout summary */}
      {(pendingPayout || paidPayout) ? (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
          <div className="px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Payouts
            </p>
          </div>
          {pendingPayout ? (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50">
                  <Wallet className="size-3.5 text-amber-500" aria-hidden />
                </span>
                <span className="text-sm text-slate-700">Pending payout</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-amber-600">
                {pendingPayout}
              </span>
            </div>
          ) : null}
          {paidPayout ? (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-50">
                  <TrendingUp className="size-3.5 text-green-500" aria-hidden />
                </span>
                <span className="text-sm text-slate-700">Last paid out</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-green-600">
                {paidPayout}
              </span>
            </div>
          ) : null}
          <div className="px-4 py-2.5">
            <button
              type="button"
              onClick={onViewPayout}
              className="flex w-full items-center justify-between text-sm font-semibold text-blue-600 hover:underline"
            >
              View payout details
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {/* Bonuses */}
      {bonusTotal ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Bonuses</p>
            <span className="text-sm font-bold tabular-nums text-emerald-600">{bonusTotal}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3.5 text-center">
          <p className="text-xs font-medium text-slate-400">No bonuses on recent jobs</p>
        </div>
      )}
    </div>
  );
}
