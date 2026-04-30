"use client";

import { ChevronRight } from "lucide-react";
import { cleanerEarningsFullyEmpty } from "@/lib/cleaner/cleanerEarningsFullyEmpty";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import {
  CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY,
  cleanerBankDetailsPromptWithEligible,
  nextPayoutMondayWithRelativeDays,
  paidWeeklyPayoutCadenceLine,
} from "@/lib/cleaner/cleanerPayoutCopy";

type Props = {
  eligibleCents: number;
  pendingCents: number;
  paidCents: number;
  invalidCents?: number;
  /** From `/api/cleaner/earnings` row count — show R0.00 when jobs exist but buckets are zero. */
  completedEarningsRowCount?: number;
  loading?: boolean;
  /** When true, hide next-payout line and show bank setup hint. */
  missingBankDetails?: boolean;
  onViewEarnings: () => void;
};

export function CleanerHomeEarningsStrip({
  eligibleCents,
  pendingCents,
  paidCents,
  invalidCents = 0,
  completedEarningsRowCount = 0,
  loading,
  missingBankDetails = false,
  onViewEarnings,
}: Props) {
  const noEarningsYet =
    !loading &&
    cleanerEarningsFullyEmpty(
      {
        pending_cents: pendingCents,
        eligible_cents: eligibleCents,
        paid_cents: paidCents,
        invalid_cents: invalidCents,
      },
      { completedEarningsRowCount },
    );

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available</p>
          {loading ? (
            <span className="mt-1 inline-block h-8 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          ) : eligibleCents > 0 ? (
            <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatZarFromCents(eligibleCents)}
            </p>
          ) : noEarningsYet ? (
            <p className="mt-1 text-base font-medium leading-snug text-zinc-700 dark:text-zinc-300">
              You&apos;ll earn once you complete your jobs
            </p>
          ) : (
            <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatZarFromCents(eligibleCents)}
            </p>
          )}
        </div>
        {eligibleCents > 0 && !missingBankDetails ? (
          <div className="space-y-0.5 text-right">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{nextPayoutMondayWithRelativeDays()}</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{paidWeeklyPayoutCadenceLine()}</p>
          </div>
        ) : null}
      </div>
      {!loading && invalidCents > 0 ? (
        <div
          className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/25"
          title="Needs attention is not included in available payouts."
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200/90">
            Needs attention
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-amber-950 dark:text-amber-50">
            {formatZarFromCents(invalidCents)}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-amber-900/85 dark:text-amber-100/75">
            Needs attention is not included in available payouts. Tap <span className="font-semibold">View earnings</span>{" "}
            for details.
          </p>
        </div>
      ) : null}
      {missingBankDetails && !loading ? (
        <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
          {eligibleCents > 0 ? cleanerBankDetailsPromptWithEligible(eligibleCents) : CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onViewEarnings}
        className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50/80 dark:text-blue-400 dark:hover:bg-blue-950/30"
      >
        View earnings
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
