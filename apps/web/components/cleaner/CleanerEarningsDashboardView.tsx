"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BookingSupportRefChip } from "@/components/cleaner/BookingSupportRefChip";
import { formatZarFromCents, formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import {
  nextPayoutMondayWithRelativeDays,
  paidWeeklyPayoutCadenceLine,
  weeklyPayoutExplainerShort,
} from "@/lib/cleaner/cleanerPayoutCopy";

export type EarningsHistoryRow = {
  booking_id: string;
  date: string | null;
  service: string;
  location: string;
  payout_status: "pending" | "eligible" | "paid" | "invalid";
  payout_frozen_cents: number | null;
  amount_cents: number;
  /** Set only when `payout_status === "paid"` (from `bookings.payout_paid_at`). */
  payout_paid_at: string | null;
  /** From `bookings.payout_run_id` when paid (batch correlation). */
  payout_run_id: string | null;
};

function formatDateYmd(value: string | null): string {
  if (!value) return "—";
  const d = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return value.slice(0, 16);
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function formatPaidAt(iso: string | null): string {
  if (!iso) return "Being finalised";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  return new Date(iso).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

function historyRowAmountCents(row: EarningsHistoryRow): number {
  return row.payout_status === "eligible" || row.payout_status === "paid" || row.payout_status === "invalid"
    ? typeof row.payout_frozen_cents === "number" && row.payout_frozen_cents > 0
      ? row.payout_frozen_cents
      : row.amount_cents
    : row.amount_cents;
}

function HistoryLine({ row, showPaidOn }: { row: EarningsHistoryRow; showPaidOn: boolean }) {
  const amount = historyRowAmountCents(row);

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-zinc-900 dark:text-zinc-50">{row.service}</p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{formatDateYmd(row.date)} · {row.location}</p>
        {row.payout_status === "invalid" ? (
          <p className="mt-1 text-xs font-medium text-amber-900 dark:text-amber-100">
            Payment issue (Ref: <BookingSupportRefChip bookingId={row.booking_id} className="align-baseline" />
            ). Contact support.
          </p>
        ) : null}
        {showPaidOn && row.payout_status === "paid" ? (
          <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">Paid on {formatPaidAt(row.payout_paid_at)}</p>
        ) : null}
      </div>
      <p className="shrink-0 text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{formatZarFromCents(amount)}</p>
    </li>
  );
}

export function CleanerEarningsDashboardView({
  todayZar,
  weekZar,
  monthZar,
  eligibleCents,
  pendingCents,
  paidCents,
  rows,
  missingBankDetails,
  lastPayout,
  headerSlot,
  compact = false,
}: {
  todayZar: number;
  weekZar: number;
  monthZar: number;
  eligibleCents: number;
  pendingCents: number;
  paidCents: number;
  rows: EarningsHistoryRow[];
  missingBankDetails: boolean;
  lastPayout: { cents: number; paidAtIso: string } | null;
  /** Page: back + refresh. Tab: omit or null. */
  headerSlot?: ReactNode;
  /** Mobile tab: tighter width / padding. */
  compact?: boolean;
}) {
  const invalidRows = [...rows.filter((r) => r.payout_status === "invalid")].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
  const paidRows = [...rows.filter((r) => r.payout_status === "paid")].sort((a, b) =>
    String(b.payout_paid_at ?? "").localeCompare(String(a.payout_paid_at ?? "")),
  );
  const eligibleRows = [...rows.filter((r) => r.payout_status === "eligible")].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
  const pendingRows = [...rows.filter((r) => r.payout_status === "pending")].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );

  const invalidCentsTotal = invalidRows.reduce((s, r) => s + historyRowAmountCents(r), 0);

  const hasHistory =
    invalidRows.length > 0 || paidRows.length > 0 || eligibleRows.length > 0 || pendingRows.length > 0;

  return (
    <div
      className={
        compact
          ? "mx-auto max-w-md space-y-6 py-2"
          : "mx-auto max-w-3xl space-y-8 px-4 py-8"
      }
    >
      {headerSlot ? <div className="flex flex-wrap items-start justify-between gap-3">{headerSlot}</div> : null}

      {/* 1) Earnings summary */}
      <section className="rounded-2xl bg-zinc-50/90 px-4 py-5 dark:bg-zinc-900/50">
        <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Earnings</h2>
        <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-8 sm:gap-y-2">
          <p className="tabular-nums text-zinc-800 dark:text-zinc-200">
            <span className="font-medium text-zinc-500 dark:text-zinc-400">Today</span>{" "}
            <span className="text-lg font-bold text-zinc-950 dark:text-zinc-50">{formatZarWhole(todayZar)}</span>
          </p>
          <p className="tabular-nums text-zinc-800 dark:text-zinc-200">
            <span className="font-medium text-zinc-500 dark:text-zinc-400">This week</span>{" "}
            <span className="text-lg font-bold text-zinc-950 dark:text-zinc-50">{formatZarWhole(weekZar)}</span>
          </p>
          <p className="tabular-nums text-zinc-800 dark:text-zinc-200">
            <span className="font-medium text-zinc-500 dark:text-zinc-400">This month</span>{" "}
            <span className="text-lg font-bold text-zinc-950 dark:text-zinc-50">{formatZarWhole(monthZar)}</span>
          </p>
        </div>
      </section>

      {/* 2) Payout status */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Payout status</h2>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50/95 to-white px-5 py-5 dark:from-emerald-950/30 dark:to-zinc-900">
          {eligibleCents > 0 && !missingBankDetails ? (
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                {nextPayoutMondayWithRelativeDays()}
              </p>
              <p className="text-xs font-medium text-emerald-900/90 dark:text-emerald-100/85">
                {paidWeeklyPayoutCadenceLine()}
              </p>
            </div>
          ) : (
            <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50">{weeklyPayoutExplainerShort()}</p>
          )}
          {eligibleCents > 0 ? (
            <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100/90">
              You&apos;ll receive {formatZarFromCents(eligibleCents)} in the next payout.
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No amount queued for the next payout yet.</p>
          )}
          <div className="mt-6 space-y-4 border-t border-emerald-200/60 pt-5 dark:border-emerald-800/40">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/90 dark:text-emerald-200/90">
                Available to be paid
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950 dark:text-emerald-50">
                {formatZarFromCents(eligibleCents)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">In progress</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{formatZarFromCents(pendingCents)}</p>
            </div>
            {invalidCentsTotal > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/90 dark:text-amber-200/90">
                  Needs attention
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-amber-950 dark:text-amber-50">
                  {formatZarFromCents(invalidCentsTotal)}
                </p>
                <p
                  className="mt-1 text-xs leading-snug text-amber-950/85 dark:text-amber-100/75"
                  title="Needs attention is not included in available payouts."
                >
                  Needs attention is not included in available payouts. Tap a reference in Earnings history below to copy.
                </p>
              </div>
            ) : null}
            {paidCents > 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Lifetime paid out: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatZarFromCents(paidCents)}</span>
              </p>
            ) : null}
            {lastPayout ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">Last payout:</span>{" "}
                <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{formatZarFromCents(lastPayout.cents)}</span>
                <span className="text-zinc-500"> · {formatPaidAt(lastPayout.paidAtIso)}</span>
              </p>
            ) : null}
          </div>
        </div>

        {missingBankDetails ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/25">
            <p className="text-sm font-medium text-amber-950 dark:text-amber-100">Add bank details so we can pay you.</p>
            <Link
              href="/cleaner/settings/payment"
              className="text-sm font-semibold text-amber-900 underline-offset-2 hover:underline dark:text-amber-200"
            >
              Payment settings
            </Link>
          </div>
        ) : null}
      </section>

      {/* 3) Earnings history */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Earnings history</h2>

        {!hasHistory ? (
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-8 text-center dark:bg-zinc-900/40">
            <p className="text-sm font-medium leading-snug text-zinc-700 dark:text-zinc-300">
              You&apos;ll earn once you complete your jobs
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {invalidRows.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-amber-950 dark:text-amber-100">Needs attention</h3>
                <ul className="divide-y divide-amber-100 rounded-xl bg-amber-50/60 px-4 dark:divide-amber-900/30 dark:bg-amber-950/25">
                  {invalidRows.map((row) => (
                    <HistoryLine key={row.booking_id} row={row} showPaidOn={false} />
                  ))}
                </ul>
              </div>
            ) : null}
            {paidRows.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Paid</h3>
                <ul className="divide-y divide-zinc-100 rounded-xl bg-white px-4 dark:divide-zinc-800 dark:bg-zinc-900/30">
                  {paidRows.map((row) => (
                    <HistoryLine key={row.booking_id} row={row} showPaidOn />
                  ))}
                </ul>
              </div>
            ) : null}
            {eligibleRows.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">Available to be paid</h3>
                <ul className="divide-y divide-zinc-100 rounded-xl bg-emerald-50/40 px-4 dark:divide-emerald-900/20 dark:bg-emerald-950/20">
                  {eligibleRows.map((row) => (
                    <HistoryLine key={row.booking_id} row={row} showPaidOn={false} />
                  ))}
                </ul>
              </div>
            ) : null}
            {pendingRows.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">In progress</h3>
                <ul className="divide-y divide-zinc-100 rounded-xl bg-zinc-50/80 px-4 dark:divide-zinc-800 dark:bg-zinc-900/40">
                  {pendingRows.map((row) => (
                    <HistoryLine key={row.booking_id} row={row} showPaidOn={false} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
