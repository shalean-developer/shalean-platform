"use client";

import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type AvailabilityCardProps = {
  receivingOffers: boolean;
  rosterIncludesToday: boolean;
  browserOnline: boolean;
  onGoAvailable: () => void;
  onGoOffline: () => void;
  availabilityBusy?: boolean;
  jobsCount?: number | null;
  ratingDisplay?: string | null;
  todayEarningsLabel?: string | null;
  idle?: boolean;
  className?: string;
};

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        active ? "bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]" : "bg-slate-300",
      )}
    />
  );
}

export function AvailabilityCard({
  receivingOffers,
  rosterIncludesToday,
  browserOnline,
  onGoAvailable,
  onGoOffline,
  availabilityBusy = false,
  jobsCount,
  ratingDisplay,
  todayEarningsLabel,
  idle = false,
  className,
}: AvailabilityCardProps) {
  const isOnline = browserOnline && receivingOffers;
  const statusLabel = !browserOnline
    ? "Offline"
    : receivingOffers
      ? "Online"
      : "Offline";
  const subLabel = !browserOnline
    ? "No internet connection"
    : receivingOffers
      ? "Available for jobs"
      : rosterIncludesToday
        ? "Set yourself online to receive jobs"
        : "Off today";

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <StatusDot active={isOnline} />
          <div>
            <p
              className={cn(
                "text-sm font-semibold leading-none",
                isOnline ? "text-green-700" : "text-slate-500",
              )}
            >
              {statusLabel}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{subLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={receivingOffers ? onGoOffline : onGoAvailable}
          disabled={availabilityBusy || !browserOnline}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
            receivingOffers
              ? "border-slate-200 bg-white text-slate-700 hover:bg-gray-50"
              : "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
          )}
          aria-label={receivingOffers ? "Go offline" : "Go online"}
        >
          {availabilityBusy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          {receivingOffers ? "Go offline" : "Go online"}
        </button>
      </div>

      <div className="mt-3.5 grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-3">
        <div className="flex flex-col items-center gap-0.5 px-2 first:pl-0 last:pr-0">
          <p className="text-xs font-medium text-slate-400">Jobs</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">
            {jobsCount ?? 0}
          </p>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-2">
          <div className="flex items-center gap-0.5">
            <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
            <p className="text-xs font-medium text-slate-400">Rating</p>
          </div>
          <p className="text-lg font-bold text-slate-900 tabular-nums">
            {ratingDisplay ?? "—"}
          </p>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-2 last:pr-0">
          <p className="text-xs font-medium text-slate-400">Earnings</p>
          <p
            className={cn(
              "text-lg font-bold tabular-nums",
              isOnline ? "text-green-600" : "text-slate-900",
            )}
          >
            {todayEarningsLabel ?? "R0,00"}
          </p>
        </div>
      </div>

      {idle && isOnline ? (
        <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" aria-hidden />
          Looking for nearby jobs…
        </div>
      ) : null}
    </div>
  );
}
