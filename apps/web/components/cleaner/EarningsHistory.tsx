"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BookingSupportRefChip } from "@/components/cleaner/BookingSupportRefChip";
import { PayoutStatusBadge } from "@/components/cleaner/PayoutStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

const INITIAL = 6;
const PAGE = 10;

function formatRowDate(ymd: string | null): string {
  const d = String(ymd ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function rowAmountCents(row: CleanerPayoutSummaryRow): number {
  const st = row.payout_status;
  if (st === "eligible" || st === "paid" || st === "invalid") {
    if (typeof row.payout_frozen_cents === "number" && row.payout_frozen_cents > 0) return row.payout_frozen_cents;
  }
  return row.amount_cents;
}

export function EarningsHistory({
  rows,
  /** @deprecated Use lazy list instead; kept for callers that pin a max. */
  limit,
  lazy = true,
}: {
  rows: CleanerPayoutSummaryRow[];
  limit?: number;
  lazy?: boolean;
}) {
  const router = useRouter();
  const [shown, setShown] = useState(INITIAL);

  const effectiveLimit = lazy ? Math.min(rows.length, shown) : Math.min(rows.length, limit ?? rows.length);
  const slice = useMemo(() => rows.slice(0, effectiveLimit), [rows, effectiveLimit]);
  const canShowMore = lazy && shown < rows.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recent activity</CardTitle>
        <CardDescription>Tap a row for the job — tap the ref to copy for support.</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-2 pt-0">
        {slice.length === 0 ? (
          <p className="px-6 text-sm text-zinc-600 dark:text-zinc-400">No completed jobs with earnings yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {slice.map((row) => (
              <li key={row.booking_id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:active:bg-zinc-800"
                  onClick={() => router.push(`/cleaner/job/${encodeURIComponent(row.booking_id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/cleaner/job/${encodeURIComponent(row.booking_id)}`);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{formatRowDate(row.date)}</span>
                      <PayoutStatusBadge row={row} />
                    </div>
                    <div className="text-sm text-zinc-800 dark:text-zinc-200">
                      <span onClick={(e) => e.stopPropagation()} className="inline">
                        <BookingSupportRefChip bookingId={row.booking_id} />
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400"> · {row.service}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatZarFromCents(rowAmountCents(row))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {canShowMore ? (
          <div className="px-4 pb-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-sm font-semibold text-zinc-700 dark:text-zinc-200"
              onClick={() => setShown((n) => Math.min(n + PAGE, rows.length))}
            >
              Show more ({rows.length - shown} left)
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
