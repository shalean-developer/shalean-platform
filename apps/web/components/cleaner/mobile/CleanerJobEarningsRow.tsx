"use client";

import type { ReactNode } from "react";
import { formatTakesAboutJobHoursLine } from "@/lib/cleaner/cleanerMobileBookingMap";
import {
  cleanerUxEstimatedPayZar,
  formatCleanerUxEstimatedPayRangeLabel,
} from "@/lib/cleaner/cleanerUxEstimatedPayZar";
import { formatZarFromCents, formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";

type Props = {
  service: string;
  earningsZar: number | null;
  /** Whole-job display cents when known (preferred for ZAR formatting vs rounded ZAR). */
  earningsCents?: number | null;
  /** Set when API used team placeholder or price-based estimate. */
  earningsIsEstimate?: boolean;
  className?: string;
  /** When false, only the pay column is shown (e.g. offer card where service is above). */
  showServiceColumn?: boolean;
  /** From `booking_snapshot.locked.finalHours` (or default); drives “Takes ~Xh” when pay is shown. */
  durationHours?: number | null;
  isTeamJob?: boolean;
  /** Roster size for team jobs; clarifies pay is per cleaner, not one total split across N. */
  teamMemberCount?: number | null;
  /** When `showServiceColumn` is false, renders above pay in the same bordered card (team assignment + status). */
  teamStatusSlot?: ReactNode;
  /** From `/api/cleaner/me` — UX-only heuristic when display earnings are missing. */
  cleanerCreatedAtIso?: string | null;
  /** Booking total in ZAR when known — UX-only heuristic input. */
  jobTotalZar?: number | null;
};

export function CleanerJobEarningsRow({
  service,
  earningsZar,
  earningsCents,
  earningsIsEstimate = false,
  className,
  showServiceColumn = true,
  durationHours,
  isTeamJob = false,
  teamMemberCount,
  teamStatusSlot,
  cleanerCreatedAtIso = null,
  jobTotalZar = null,
}: Props) {
  const isEstimate = earningsIsEstimate === true;
  const centsResolved =
    earningsCents != null && Number.isFinite(Number(earningsCents))
      ? Math.max(0, Math.round(Number(earningsCents)))
      : earningsZar != null && Number.isFinite(Number(earningsZar))
        ? Math.max(0, Math.round(Number(earningsZar) * 100))
        : null;

  const uxPay = centsResolved == null ? cleanerUxEstimatedPayZar(cleanerCreatedAtIso, jobTotalZar) : null;
  const uxExactCents =
    uxPay?.kind === "exact" ? Math.max(0, Math.round(uxPay.zar * 100)) : null;
  const displayCents = centsResolved ?? uxExactCents;

  const hours =
    durationHours != null && Number.isFinite(durationHours) && durationHours > 0 ? durationHours : null;
  const takesAboutLine = hours != null ? formatTakesAboutJobHoursLine(hours) : null;
  const teamN =
    isTeamJob && typeof teamMemberCount === "number" && Number.isFinite(teamMemberCount) && teamMemberCount > 1
      ? Math.floor(teamMemberCount)
      : null;

  const teamTail =
    teamN != null ? (
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Team of {teamN} — per cleaner (not split).
      </p>
    ) : null;

  const payBlock = (
    <div className={cn("shrink-0", showServiceColumn ? "text-right" : "w-full text-right")}>
      {centsResolved != null ? (
        <>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">You earn</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatZarFromCents(centsResolved)}
            {isEstimate ? (
              <span className="ml-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">(est.)</span>
            ) : null}
          </p>
          {takesAboutLine ? (
            <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{takesAboutLine}</p>
          ) : null}
          {hours != null ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {hours >= 6 ? "Long job" : "Standard job"}
            </p>
          ) : null}
          {isEstimate ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Paid after completion</p> : null}
          {teamTail}
        </>
      ) : uxPay?.kind === "exact" ? (
        <>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">You earn</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatZarWhole(uxPay.zar)}
          </p>
          {takesAboutLine ? (
            <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{takesAboutLine}</p>
          ) : null}
          {hours != null ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {hours >= 6 ? "Long job" : "Standard job"}
            </p>
          ) : null}
          {teamTail}
        </>
      ) : (
        <>
          <p className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCleanerUxEstimatedPayRangeLabel()}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Paid after completion</p>
          {teamTail}
        </>
      )}
    </div>
  );

  if (!showServiceColumn) {
    if (teamStatusSlot) {
      return (
        <div
          className={cn(
            "overflow-hidden rounded-xl border border-amber-200/80 shadow-sm dark:border-amber-900/40",
            className,
          )}
        >
          <div className="border-b border-amber-200/50 bg-blue-50/90 px-3 py-2.5 text-sm dark:border-amber-900/30 dark:bg-blue-950/35">
            {teamStatusSlot}
          </div>
          <div className="bg-gradient-to-br from-amber-50/95 to-white px-3 py-3 dark:from-amber-950/40 dark:to-zinc-900/40">
            {payBlock}
          </div>
        </div>
      );
    }
    return (
      <div
        className={cn(
          "rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/95 to-white px-3 py-3 dark:border-amber-900/40 dark:from-amber-950/40 dark:to-zinc-900/40",
          className,
        )}
      >
        {payBlock}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-800/60",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Service</p>
        <p className="mt-0.5 font-semibold text-zinc-900 dark:text-zinc-50">{service}</p>
      </div>
      {payBlock}
    </div>
  );
}
