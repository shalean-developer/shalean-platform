"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import {
  CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY,
  cleanerBankDetailsPromptWithEligible,
  nextPayoutMondayWithRelativeDays,
  paidWeeklyPayoutCadenceLine,
  payoutPaidAtWithinLastWeek,
  weeklyPayoutExplainerShort,
} from "@/lib/cleaner/cleanerPayoutCopy";
import { cleanerEarningsFullyEmpty } from "@/lib/cleaner/cleanerEarningsFullyEmpty";
import { BookingSupportRefChip } from "@/components/cleaner/BookingSupportRefChip";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

function formatPaidLineDate(iso: string | null, fallbackYmd: string | null): string {
  if (iso) {
    const t = new Date(iso).getTime();
    if (Number.isFinite(t)) {
      return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
    }
  }
  const d = String(fallbackYmd ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function rowDisplayAmountCents(row: CleanerPayoutSummaryRow): number {
  const st = row.payout_status;
  if (st === "eligible" || st === "paid" || st === "invalid") {
    if (typeof row.payout_frozen_cents === "number" && row.payout_frozen_cents > 0) return row.payout_frozen_cents;
  }
  return row.amount_cents;
}

const FIRST_EARN_LS_KEY = "shalean_cleaner_first_earn_banner_v1";
const FIRST_EARN_SS_KEY = "shalean_cleaner_first_earn_banner_ss_v1";

function PeriodLine({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">{formatZarFromCents(cents)}</span>
    </div>
  );
}

export function CleanerEarningsUnifiedView({
  todayCents,
  weekCents,
  monthCents,
  eligibleCents,
  pendingCents,
  paidCents,
  invalidCents = 0,
  pendingJobCount,
  missingBankDetails,
  paidRowsSorted,
  completedEarningsRowCount = 0,
  className = "",
}: {
  todayCents: number;
  weekCents: number;
  monthCents: number;
  eligibleCents: number;
  pendingCents: number;
  paidCents: number;
  invalidCents?: number;
  pendingJobCount: number;
  missingBankDetails: boolean;
  paidRowsSorted: CleanerPayoutSummaryRow[];
  /** From GET /api/cleaner/earnings `rows.length` — avoids “No earnings yet” when totals are R0 but jobs exist. */
  completedEarningsRowCount?: number;
  className?: string;
}) {
  const periodAllZero = todayCents + weekCents + monthCents === 0;
  const noEarningsYet = cleanerEarningsFullyEmpty(
    {
      pending_cents: pendingCents,
      eligible_cents: eligibleCents,
      paid_cents: paidCents,
      invalid_cents: invalidCents,
    },
    { completedEarningsRowCount },
  );

  const [firstEarnCelebrate, setFirstEarnCelebrate] = useState<{ cents: number } | null>(null);
  const prevWalletSumRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(FIRST_EARN_LS_KEY) || sessionStorage.getItem(FIRST_EARN_SS_KEY)) {
      if (!noEarningsYet) {
        prevWalletSumRef.current = pendingCents + eligibleCents + paidCents + invalidCents;
      }
      return;
    }

    if (noEarningsYet) {
      prevWalletSumRef.current = 0;
      return;
    }

    const total = pendingCents + eligibleCents + paidCents + invalidCents;
    const prev = prevWalletSumRef.current;

    if (total > 0 && (prev === null || prev === 0)) {
      localStorage.setItem(FIRST_EARN_LS_KEY, "1");
      sessionStorage.setItem(FIRST_EARN_SS_KEY, "1");
      setFirstEarnCelebrate({ cents: total });
    }

    prevWalletSumRef.current = total;
  }, [noEarningsYet, pendingCents, eligibleCents, paidCents, invalidCents]);

  return (
    <div className={`space-y-10 ${className}`.trim()}>
      {!noEarningsYet ? (
        <section className="rounded-2xl border border-zinc-200/90 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">This week</span>
              <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatZarFromCents(weekCents)}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Today</span>
              <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatZarFromCents(todayCents)}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">Mon–Sun</p>
        </section>
      ) : null}
      {firstEarnCelebrate ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
          role="status"
        >
          <p className="font-semibold">🎉 First earnings received</p>
          <p className="mt-1 text-base font-bold tabular-nums">+{formatZarFromCents(firstEarnCelebrate.cents)} added</p>
        </div>
      ) : null}
      <section className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Earnings by period</p>
        {noEarningsYet ? (
          <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">No earnings yet</p>
            <p className="mt-1 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
              Complete your first job to start earning
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <PeriodLine label="This month" cents={monthCents} />
          </div>
        )}
        {!noEarningsYet && periodAllZero ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Complete your first job to start earning.</p>
        ) : null}
        <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">{weeklyPayoutExplainerShort()}</p>
      </section>

      <section className="space-y-2 border-t border-zinc-200/80 pt-8 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available</p>
        {noEarningsYet ? (
          <p className="text-base font-medium leading-snug text-zinc-700 dark:text-zinc-300">
            You&apos;ll earn once you complete your jobs
          </p>
        ) : (
          <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
            {formatZarFromCents(eligibleCents)}
          </p>
        )}
        {eligibleCents > 0 && !missingBankDetails ? (
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{nextPayoutMondayWithRelativeDays()}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{paidWeeklyPayoutCadenceLine()}</p>
          </div>
        ) : null}
        {invalidCents > 0 ? (
          <div
            className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20"
            title="Needs attention is not included in available payouts."
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200/90">
              Needs attention
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-amber-950 dark:text-amber-50">
              {formatZarFromCents(invalidCents)}
            </p>
            <p className="mt-1 text-xs leading-snug text-amber-900/85 dark:text-amber-100/80">
              Needs attention is not included in available payouts. Tap a reference in History below to copy, or open
              Earnings from home.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-2 border-t border-zinc-200/80 pt-8 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">In progress</p>
        <p className="text-sm font-normal tabular-nums text-zinc-500 dark:text-zinc-400">{formatZarFromCents(pendingCents)}</p>
        {pendingJobCount > 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            ({pendingJobCount} {pendingJobCount === 1 ? "job" : "jobs"} being processed)
          </p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No jobs in progress for payout yet.</p>
        )}
      </section>

      <section className="space-y-2 border-t border-zinc-200/80 pt-8 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Payout status</p>
        {missingBankDetails ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
              {eligibleCents > 0 ? cleanerBankDetailsPromptWithEligible(eligibleCents) : CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY}
            </p>
            <Link
              href="/cleaner/settings/payment"
              className="inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              Add now
            </Link>
          </div>
        ) : (
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">✓ Payments set up</p>
        )}
      </section>

      <section className="space-y-4 border-t border-zinc-200/80 pt-8 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">History</p>
        {paidRowsSorted.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {noEarningsYet
              ? "Complete your first job to start earning."
              : "Paid jobs will show here after each payout."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {paidRowsSorted.map((row) => (
              <li key={row.booking_id} className="text-sm text-zinc-800 dark:text-zinc-200">
                {row.payout_status === "invalid" || row.__invalid ? (
                  <span className="font-medium text-amber-900 dark:text-amber-100">
                    Payment issue (Ref:{" "}
                    <BookingSupportRefChip bookingId={row.booking_id} className="align-baseline" />
                    ). Tap to copy. Contact support.
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-emerald-800 dark:text-emerald-200">Paid</span>
                    <span className="text-zinc-400"> · </span>
                    <span className="font-semibold tabular-nums">{formatZarFromCents(rowDisplayAmountCents(row))}</span>
                    <span className="text-zinc-400"> · </span>
                    <span className="text-zinc-600 dark:text-zinc-400">{formatPaidLineDate(row.payout_paid_at, row.date)}</span>
                    {payoutPaidAtWithinLastWeek(row.payout_paid_at) ? (
                      <span className="ml-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">✔ Paid this week</span>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
