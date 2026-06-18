"use client";

import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import {
  cleanerFacingDisplayEarningsCents,
  mobilePhaseDisplayForDashboard,
} from "@/lib/cleaner/cleanerMobileBookingMap";
import {
  formatJobScopeCompactLine,
  splitJobLocationPrimarySecondary,
} from "@/lib/cleaner/cleanerJobsListDerived";
import { formatCleanerJobEarningsLabel } from "@/lib/cleaner/cleanerZarFormat";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { cleanerJobDetailHref } from "@/lib/cleaner/cleanerJobDetailHref";
import { CleanerJobPrimaryActionButton } from "@/components/cleaner/CleanerJobPrimaryActionButton";

type JobCardProps = {
  row: CleanerBookingRow;
  variant: "upcoming" | "past";
  now?: Date;
  className?: string;
  onRowPatched?: (bookingId: string, patch: Partial<CleanerBookingRow>) => void;
  onRefresh?: () => void | Promise<void>;
};

function statusChipClass(phase: string): string {
  const s = phase.trim().toLowerCase();
  if (s === "completed") return "bg-green-50 text-green-700 border border-green-200";
  if (s === "cancelled") return "bg-gray-100 text-gray-500 border border-gray-200";
  if (s === "in progress") return "bg-sky-50 text-sky-700 border border-sky-200";
  if (s === "en route") return "bg-amber-50 text-amber-700 border border-amber-200";
  if (s === "assigned") return "bg-blue-50 text-blue-700 border border-blue-200";
  return "bg-gray-50 text-gray-600 border border-gray-200";
}

export function JobCard({ row, variant, now = new Date(), className, onRowPatched, onRefresh }: JobCardProps) {
  const href = cleanerJobDetailHref(row.id);
  const cents = cleanerFacingDisplayEarningsCents(row);
  const rec = row as Record<string, unknown>;
  const estimate =
    row.displayEarningsIsEstimate === true ||
    row.earnings_estimated === true ||
    row.earnings_is_estimate === true ||
    rec.displayEarningsIsEstimate === true;

  const earningsLabel =
    cents != null
      ? formatCleanerJobEarningsLabel(cents, { estimate })
      : "Processing…";

  const { primary: locPrimary } = splitJobLocationPrimarySecondary(row.location);
  const scopeLine = formatJobScopeCompactLine(row);
  const phase = mobilePhaseDisplayForDashboard(row);
  const timeRaw = String(row.time ?? "").trim() || "—";
  const dateRaw = String(row.date ?? "").trim();
  const whenLine =
    variant === "upcoming"
      ? `${dateRaw ? jobDateHeading(dateRaw, now) : "Scheduled"} • ${timeRaw}`
      : timeRaw;

  const directionsRaw = String(row.location ?? "").trim();
  const mapsQuery =
    variant === "upcoming" && directionsRaw
      ? directionsRaw.split(/\r?\n/)[0]?.trim() ?? directionsRaw
      : null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden",
        className,
      )}
    >
      <Link
        href={href}
        className="block px-4 pt-3.5 pb-3 transition-colors hover:bg-gray-50 active:bg-gray-50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="mt-0.5 size-3.5 shrink-0 text-blue-400" aria-hidden />
              <span className="text-sm font-semibold text-slate-900">{whenLine}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-300" aria-hidden />
              <span className="text-sm text-slate-600 leading-tight">{locPrimary || "Address on file"}</span>
            </div>
            {scopeLine ? (
              <p className="pl-5 text-xs text-slate-400">{scopeLine}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                statusChipClass(phase),
              )}
            >
              {phase}
            </span>
            <span className="text-base font-bold tabular-nums text-slate-900">
              {earningsLabel}
            </span>
          </div>
        </div>
      </Link>

      {variant === "upcoming" ? (
        <div className="border-t border-gray-50 px-4 py-2">
          <CleanerJobPrimaryActionButton
            bookingId={row.id}
            row={row}
            mapsQuery={mapsQuery}
            size="compact"
            onRowPatched={onRowPatched}
            onRefresh={onRefresh}
          />
        </div>
      ) : null}
    </div>
  );
}
