"use client";

import type { ReactNode } from "react";
import { formatApproxEarningsPerHourZar } from "@/lib/cleaner/cleanerMobileBookingMap";
import { cn } from "@/lib/utils";

type Props = {
  service: string;
  earningsZar: number | null;
  /** Set when API used team placeholder (no stored display earnings yet). */
  earningsIsEstimate?: boolean;
  className?: string;
  /** When false, only the pay column is shown (e.g. offer card where service is above). */
  showServiceColumn?: boolean;
  /** From `booking_snapshot.locked.finalHours` (or default); drives ≈ R/hr when pay known. */
  durationHours?: number | null;
  isTeamJob?: boolean;
  /** Roster size for team jobs; clarifies pay is per cleaner, not one total split across N. */
  teamMemberCount?: number | null;
  /** When `showServiceColumn` is false, renders above pay in the same bordered card (team assignment + status). */
  teamStatusSlot?: ReactNode;
};

export function CleanerJobEarningsRow({
  service,
  earningsZar,
  earningsIsEstimate = false,
  className,
  showServiceColumn = true,
  durationHours,
  isTeamJob = false,
  teamMemberCount,
  teamStatusSlot,
}: Props) {
  const isEstimate = earningsIsEstimate === true;
  const hours =
    durationHours != null && Number.isFinite(durationHours) && durationHours > 0 ? durationHours : null;
  const perHour =
    earningsZar != null && hours != null ? formatApproxEarningsPerHourZar(earningsZar, hours) : null;
  const teamN =
    isTeamJob && typeof teamMemberCount === "number" && Number.isFinite(teamMemberCount) && teamMemberCount > 1
      ? Math.floor(teamMemberCount)
      : null;
  const payBlock = (
    <div className={cn("shrink-0", showServiceColumn ? "text-right" : "w-full text-right")}>
      {earningsZar != null ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {isEstimate ? "Estimated earnings" : "You earn"}
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums tracking-tight",
              isEstimate ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            R{earningsZar.toLocaleString("en-ZA")}
          </p>
          {perHour ? (
            <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{perHour}</p>
          ) : null}
          {hours != null ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {hours >= 6 ? "Long job" : "Standard job"}
            </p>
          ) : null}
          {isEstimate ? (
            <p className="mt-1 max-w-[14rem] text-xs leading-snug text-zinc-500 dark:text-zinc-400">
              Final amount confirmed after job completion
            </p>
          ) : null}
          {teamN != null ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Team of {teamN} — per cleaner (not split).
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">You earn</p>
          <p className="mt-1 text-base font-bold text-amber-600 dark:text-amber-400">Pending</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">We&apos;ll show your pay once it&apos;s calculated</p>
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
