"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingSupportRefChip } from "@/components/cleaner/BookingSupportRefChip";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { nextPayoutMondayWithRelativeDays, paidWeeklyPayoutCadenceLine } from "@/lib/cleaner/cleanerPayoutCopy";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

function rowAmountCents(row: CleanerPayoutSummaryRow): number {
  const st = row.payout_status;
  if (st === "eligible" || st === "paid" || st === "invalid") {
    if (typeof row.payout_frozen_cents === "number" && row.payout_frozen_cents > 0) return row.payout_frozen_cents;
  }
  return row.amount_cents;
}

export function UpcomingPayout({
  frozenBatchCents,
  frozenRows,
  compact = false,
}: {
  frozenBatchCents: number;
  frozenRows: CleanerPayoutSummaryRow[];
  compact?: boolean;
}) {
  const list = frozenRows.slice(0, compact ? 6 : 12);
  const total = list.reduce((acc, r) => acc + rowAmountCents(r), 0);

  return (
    <Card>
      <CardHeader className={compact ? "pb-1 pt-4" : "pb-2"}>
        <CardTitle className={compact ? "text-sm" : "text-base"}>In payout batch</CardTitle>
        {!compact ? <CardDescription>{paidWeeklyPayoutCadenceLine()}</CardDescription> : null}
      </CardHeader>
      <CardContent className={compact ? "space-y-2 pb-4" : "space-y-3"}>
        {!compact ? (
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{nextPayoutMondayWithRelativeDays()}</p>
        ) : null}
        {frozenBatchCents <= 0 ? (
          <p className="text-sm leading-snug text-zinc-600 dark:text-zinc-400">
            Nothing locked for transfer yet. Jobs move from <strong>Pending</strong> → <strong>Ready</strong> → weekly batch.
          </p>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">In this transfer</p>
              <p className={compact ? "text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50" : "text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50"}>
                {formatZarFromCents(frozenBatchCents)}
              </p>
              {!compact && Math.abs(total - frozenBatchCents) > 2 ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Line items below sum to {formatZarFromCents(total)}; totals are reconciled on the server.
                </p>
              ) : null}
            </div>
            {list.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Includes
                </p>
                <ul className="space-y-1.5">
                  {list.map((row) => (
                    <li key={row.booking_id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 text-zinc-800 dark:text-zinc-200">
                        <BookingSupportRefChip bookingId={row.booking_id} className="text-sm" />
                        <span className="text-zinc-500 dark:text-zinc-400"> · {row.service}</span>
                      </span>
                      <span className="shrink-0 tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                        {formatZarFromCents(rowAmountCents(row))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Jobs in this batch will list here when linked.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
