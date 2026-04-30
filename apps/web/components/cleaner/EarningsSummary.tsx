"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

type Props = {
  /** Weekly batch locked (frozen / approved) — next transfer after admin runs payout. */
  frozenBatchCents: number;
  /** Accrued for the next weekly batch (not locked yet). */
  eligibleCents: number;
  pendingCents: number;
  paidCents: number;
  weekCents: number;
  monthCents: number;
};

function SummaryCard({
  title,
  subtitle,
  cents,
  footnote,
}: {
  title: string;
  subtitle?: string;
  cents: number;
  footnote?: string;
}) {
  return (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</p>
        {subtitle ? <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{subtitle}</p> : null}
        <p className="text-xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
          {formatZarFromCents(cents)}
        </p>
        {footnote ? <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{footnote}</p> : null}
      </CardContent>
    </Card>
  );
}

export function EarningsSummary({ frozenBatchCents, eligibleCents, pendingCents, paidCents, weekCents, monthCents }: Props) {
  const availableCents = frozenBatchCents + eligibleCents;

  return (
    <section className="space-y-4">
      {weekCents > 0 || monthCents > 0 ? (
        <div className="rounded-xl border border-zinc-200/90 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
          {weekCents > 0 ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">This week (Mon–Sun)</span>
              <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatZarFromCents(weekCents)}
              </span>
            </div>
          ) : null}
          {monthCents > 0 ? (
            <div
              className={`flex flex-wrap items-baseline justify-between gap-2 ${weekCents > 0 ? "mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800" : ""}`}
            >
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">This month</span>
              <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatZarFromCents(monthCents)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          title="Available & scheduled"
          subtitle="Frozen for next transfer + building toward the next batch"
          cents={availableCents}
          footnote={
            eligibleCents > 0 && frozenBatchCents > 0
              ? `${formatZarFromCents(frozenBatchCents)} in batch · ${formatZarFromCents(eligibleCents)} still accruing`
              : frozenBatchCents > 0
                ? "Included in the next weekly transfer after admin approval."
                : eligibleCents > 0
                  ? "Will be included once your week is batched."
                  : undefined
          }
        />
        <SummaryCard
          title="Pending (recent jobs)"
          subtitle="Earnings still being finalised for payout"
          cents={pendingCents}
        />
        <SummaryCard title="Paid (all time)" subtitle="Money confirmed to your account" cents={paidCents} />
      </div>
    </section>
  );
}
