"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { CleanerJobPrimaryActionButton } from "@/components/cleaner/CleanerJobPrimaryActionButton";

type StatusVariant = "assigned" | "accepted" | "starting-soon" | "in-progress";

type NextJobCardProps = {
  jobHref: string;
  bookingId: string;
  bookingRow: CleanerBookingRow;
  statusLabel: string;
  statusVariant?: StatusVariant;
  dateLabel: string;
  timeLabel: string;
  address: string;
  serviceLabel: string;
  durationLabel?: string;
  roomsLabel?: string;
  earningsLabel: string;
  startsAtMs: number | null;
  mapsQuery?: string | null;
  clockOffsetMs?: number;
  contactHref?: string;
  onRowPatched?: (bookingId: string, patch: Partial<CleanerBookingRow>) => void;
  onRefresh?: () => void | Promise<void>;
  className?: string;
};

function statusChipClass(variant: StatusVariant | undefined): string {
  switch (variant) {
    case "in-progress":
      return "bg-sky-100 text-sky-700 border border-sky-200";
    case "starting-soon":
      return "bg-red-100 text-red-700 border border-red-200";
    case "accepted":
      return "bg-green-100 text-green-700 border border-green-200";
    default:
      return "bg-blue-100 text-blue-700 border border-blue-200";
  }
}

function formatCountdown(msUntil: number): string {
  if (msUntil <= 0) return "Starting now";
  const totalMin = Math.floor(msUntil / 60000);
  if (totalMin < 1) return "Starts in under a minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `Starts in ${m} min`;
  if (m === 0) return `Starts in ${h}h`;
  return `Starts in ${h}h ${m}m`;
}

function urgencyClass(msUntil: number | null): string {
  if (msUntil == null) return "text-slate-500";
  if (msUntil <= 15 * 60_000) return "font-bold text-red-600";
  if (msUntil <= 45 * 60_000) return "font-semibold text-red-500";
  if (msUntil <= 2 * 60 * 60_000) return "font-semibold text-amber-600";
  return "font-semibold text-green-600";
}

export function NextJobCard({
  jobHref,
  bookingId,
  bookingRow,
  statusLabel,
  statusVariant,
  dateLabel,
  timeLabel,
  address,
  serviceLabel,
  durationLabel,
  roomsLabel,
  earningsLabel,
  startsAtMs,
  mapsQuery,
  clockOffsetMs = 0,
  contactHref,
  onRowPatched,
  onRefresh,
  className,
}: NextJobCardProps) {
  const offsetRef = useRef(clockOffsetMs);
  offsetRef.current = clockOffsetMs;
  const [nowMs, setNowMs] = useState(() => Date.now() + offsetRef.current);

  useEffect(() => {
    const tick = () => setNowMs(Date.now() + offsetRef.current);
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, []);

  const msUntil = startsAtMs != null ? startsAtMs - nowMs : null;
  const countdownText = msUntil != null ? formatCountdown(msUntil) : null;

  const scopeParts = [serviceLabel, durationLabel, roomsLabel].filter(Boolean);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm",
        className,
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Next Job
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              statusChipClass(statusVariant),
            )}
          >
            {statusLabel}
          </span>
        </div>
        {countdownText ? (
          <span className={cn("text-xs tabular-nums", urgencyClass(msUntil))}>
            {countdownText}
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Calendar className="mt-0.5 size-3.5 shrink-0 text-blue-500" aria-hidden />
              <p className="text-base font-bold text-slate-900">
                {dateLabel} • {timeLabel}
              </p>
            </div>
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
              <p className="text-sm text-slate-600 leading-tight">{address}</p>
            </div>
            {scopeParts.length > 0 ? (
              <p className="pl-5 text-xs text-slate-400">{scopeParts.join(" • ")}</p>
            ) : null}
          </div>

          <div className="shrink-0 rounded-2xl bg-green-50 border border-green-100 px-3 py-2 text-center min-w-[90px]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-green-600">
              Job Earning
            </p>
            <p className="mt-0.5 text-base font-extrabold tabular-nums text-green-700 leading-none">
              {earningsLabel}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-start gap-2">
          <CleanerJobPrimaryActionButton
            bookingId={bookingId}
            row={bookingRow}
            mapsQuery={mapsQuery}
            clockOffsetMs={clockOffsetMs}
            onRowPatched={onRowPatched}
            onRefresh={onRefresh}
          />
          {contactHref ? (
            <a
              href={contactHref}
              className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-slate-700 transition-colors hover:bg-gray-50 active:scale-95"
            >
              <Phone className="size-3.5 text-blue-500" aria-hidden />
              Contact client
            </a>
          ) : null}
        </div>
      </div>

      <Link
        href={jobHref}
        className="flex h-12 w-full items-center justify-between gap-2 bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
      >
        <span>View job details</span>
        <span aria-hidden className="text-blue-200">›</span>
      </Link>
    </div>
  );
}
