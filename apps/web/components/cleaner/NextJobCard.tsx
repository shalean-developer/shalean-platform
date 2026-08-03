"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronRight, MapPin, Phone } from "lucide-react";
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
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "starting-soon":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "accepted":
      return "border-green-200 bg-green-50 text-green-700";
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function formatCountdown(msUntil: number): string {
  if (msUntil <= -60_000) {
    const lateMinutes = Math.max(1, Math.floor(Math.abs(msUntil) / 60_000));
    return `${lateMinutes} min late`;
  }
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
  if (msUntil < 0) return "font-bold text-red-600";
  if (msUntil <= 45 * 60_000) return "font-semibold text-amber-600";
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
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Next job</p>
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", statusChipClass(statusVariant))}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Calendar className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
          <div>
            <p className="text-lg font-bold text-slate-900">{dateLabel}, {timeLabel}</p>
            {countdownText ? <p className={cn("mt-0.5 text-xs tabular-nums", urgencyClass(msUntil))}>{countdownText}</p> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-slate-800">{address}</p>
          {scopeParts.length > 0 ? <p className="mt-1 text-xs text-slate-500">{scopeParts.join(" • ")}</p> : null}
          {mapsQuery ? (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-xs font-semibold text-blue-600 hover:underline">
              Open in Maps
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-500">Expected earnings</p>
        <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-900">{earningsLabel}</p>
      </div>

      <div className="mt-4 space-y-2">
        <CleanerJobPrimaryActionButton
          bookingId={bookingId}
          row={bookingRow}
          mapsQuery={mapsQuery}
          clockOffsetMs={clockOffsetMs}
          onRowPatched={onRowPatched}
          onRefresh={onRefresh}
        />
        <Link href={jobHref} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
          View job details <ChevronRight className="size-4" aria-hidden />
        </Link>
        {contactHref ? (
          <a href={contactHref} className="flex h-10 w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
            <Phone className="size-4" aria-hidden /> Contact client
          </a>
        ) : null}
      </div>
    </section>
  );
}
