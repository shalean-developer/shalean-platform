"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BankDetailsCard } from "@/components/cleaner/BankDetailsCard";
import { CleanerEarningsSmartInsights } from "@/components/cleaner/CleanerEarningsSmartInsights";
import { CleanerEarningsStickyHeader } from "@/components/cleaner/CleanerEarningsStickyHeader";
import { CleanerEarningsTodayCard } from "@/components/cleaner/CleanerEarningsTodayCard";
import { CleanerEarningsWeekChart } from "@/components/cleaner/CleanerEarningsWeekChart";
import { CleanerNextJobEarningsCard } from "@/components/cleaner/CleanerNextJobEarningsCard";
import { EarningsHistory } from "@/components/cleaner/EarningsHistory";
import { UpcomingPayout } from "@/components/cleaner/UpcomingPayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cleanerBankDetailsPromptWithEligible, CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY, weeklyPayoutExplainerShort } from "@/lib/cleaner/cleanerPayoutCopy";
import { cleanerEarningsFullyEmpty } from "@/lib/cleaner/cleanerEarningsFullyEmpty";
import { buildEarningsInsightMessages, buildLast7DaysEarningsPoints } from "@/lib/cleaner/earningsInsightsSeries";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import type { CleanerMobileJobView } from "@/lib/cleaner/cleanerMobileBookingMap";
import type { CleanerPayoutSummary, CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

export type CleanerEarningsOverviewProps = {
  summary: CleanerPayoutSummary;
  rows: CleanerPayoutSummaryRow[];
  missingBankDetails: boolean;
  hasFailedTransfer: boolean;
  completedEarningsRowCount: number;
  /** Active / next open job from workspace (or standalone jobs fetch). */
  highlightJob?: CleanerMobileJobView | null;
  /** Open jobs count (non-completed) for friendlier empty copy on mobile home tab. */
  openJobsCount?: number | null;
  onRefresh?: () => void;
  showRefresh?: boolean;
  className?: string;
};

function MiniStat({ label, cents }: { label: string; cents: number }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex min-h-[72px] flex-col justify-center p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{formatZarFromCents(cents)}</p>
      </CardContent>
    </Card>
  );
}

export function CleanerEarningsOverview({
  summary,
  rows,
  missingBankDetails,
  hasFailedTransfer,
  completedEarningsRowCount,
  highlightJob = null,
  openJobsCount = null,
  onRefresh,
  showRefresh = false,
  className = "",
}: CleanerEarningsOverviewProps) {
  const s = summary;
  const frozenRows = rows.filter((r) => r.in_frozen_batch);
  const availableCents = (s.frozen_batch_cents ?? 0) + s.eligible_cents;
  const pendingPayoutJobs = rows.filter((r) => r.payout_status === "pending" || r.payout_status === "eligible").length;

  const chartPoints = useMemo(() => buildLast7DaysEarningsPoints(rows), [rows]);
  const insightMessages = useMemo(
    () =>
      buildEarningsInsightMessages({
        summary: s,
        points: chartPoints,
        pendingJobRows: pendingPayoutJobs,
        hasFailedTransfer,
        missingBankDetails,
      }),
    [s, chartPoints, pendingPayoutJobs, hasFailedTransfer, missingBankDetails],
  );

  const noEarningsYet = cleanerEarningsFullyEmpty(
    {
      pending_cents: s.pending_cents,
      eligible_cents: s.eligible_cents,
      paid_cents: s.paid_cents,
      invalid_cents: s.invalid_cents ?? 0,
      frozen_batch_cents: s.frozen_batch_cents ?? 0,
    },
    { completedEarningsRowCount },
  );

  return (
    <div className={`space-y-5 ${className}`.trim()}>
      {hasFailedTransfer ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-100"
          role="alert"
        >
          <p className="font-semibold">Payout transfer failed</p>
          <p className="mt-1 leading-snug">
            A transfer to your bank didn&apos;t go through. Check your details, then update them if anything changed.
          </p>
          <Button asChild className="mt-3 h-11 w-full font-semibold sm:w-auto">
            <Link href="/cleaner/settings/payment">Review bank details</Link>
          </Button>
        </div>
      ) : null}

      <CleanerEarningsStickyHeader availableCents={availableCents} weekCents={s.week_cents ?? 0} />

      {noEarningsYet && typeof openJobsCount === "number" && openJobsCount > 0 ? (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-50">
          <p className="font-semibold">You have {openJobsCount} active job{openJobsCount === 1 ? "" : "s"}</p>
          <p className="mt-1 leading-snug text-sky-900/90 dark:text-sky-100/85">
            Earnings show here after each job is <strong>completed</strong> and processed for payout.
          </p>
        </div>
      ) : null}

      {noEarningsYet && (!(typeof openJobsCount === "number") || openJobsCount <= 0) ? (
        <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">No earnings yet</p>
          <p className="mt-1 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
            Complete jobs to see money in <strong>Available</strong> and <strong>Pending</strong>. Totals update after each
            completion.
          </p>
        </div>
      ) : null}

      {!noEarningsYet && pendingPayoutJobs > 0 ? (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-center text-xs font-medium text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">
          {pendingPayoutJobs} completed job{pendingPayoutJobs === 1 ? "" : "s"} in payout pipeline
        </p>
      ) : null}

      <CleanerNextJobEarningsCard job={highlightJob ?? null} />

      <section aria-labelledby="earnings-insights-heading" className="space-y-3">
        <h2 id="earnings-insights-heading" className="sr-only">
          Earnings insights
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <CleanerEarningsTodayCard todayCents={s.today_cents ?? 0} weekCents={s.week_cents ?? 0} />
          <CleanerEarningsWeekChart points={chartPoints} />
        </div>
        <CleanerEarningsSmartInsights messages={insightMessages} />
      </section>

      {(s.invalid_cents ?? 0) > 0 ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200/90">Needs attention</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-amber-950 dark:text-amber-50">
            {formatZarFromCents(s.invalid_cents ?? 0)}
          </p>
          <p className="mt-1 text-xs leading-snug text-amber-900/85 dark:text-amber-100/80">
            Not included in payouts until fixed. Tap a ref in activity below to copy for support.
          </p>
        </div>
      ) : null}

      {missingBankDetails ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-50">
          <p className="font-semibold">Add your bank account</p>
          <p className="mt-1 leading-snug">
            {s.eligible_cents > 0 ? cleanerBankDetailsPromptWithEligible(s.eligible_cents) : CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY}
          </p>
          <Button asChild className="mt-3 h-11 w-full bg-amber-600 font-semibold hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500">
            <Link href="/cleaner/settings/payment">Add now</Link>
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="earnings-summary-heading">
        <h2 id="earnings-summary-heading" className="sr-only">
          Earnings summary
        </h2>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Earnings summary</p>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Pending" cents={s.pending_cents} />
          <MiniStat label="Paid (all time)" cents={s.paid_cents} />
        </div>
      </section>

      <UpcomingPayout frozenBatchCents={s.frozen_batch_cents ?? 0} frozenRows={frozenRows} compact />

      <EarningsHistory rows={rows} lazy />

      <BankDetailsCard />

      <p className="text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{weeklyPayoutExplainerShort()}</p>

      {showRefresh && onRefresh ? (
        <Button type="button" variant="outline" className="h-11 w-full font-semibold" onClick={() => void onRefresh()}>
          Refresh earnings
        </Button>
      ) : null}
    </div>
  );
}
