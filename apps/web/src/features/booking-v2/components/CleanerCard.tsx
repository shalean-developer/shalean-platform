"use client";

import { Star, MapPin, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AvailableCleanerV2, CleanerBadge } from "@/src/features/booking-v2/types";

const BADGE_CONFIG: Record<CleanerBadge, { label: string; className: string }> = {
  recommended: {
    label: "Recommended",
    className: "bg-blue-50 text-blue-700 border border-blue-200",
  },
  top_rated: {
    label: "Top rated",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  nearby: {
    label: "Nearby",
    className: "bg-green-50 text-green-700 border border-green-200",
  },
  new: {
    label: "New",
    className: "bg-slate-50 text-slate-500 border border-slate-200",
  },
};

type Props = {
  cleaner: AvailableCleanerV2;
  isSelected: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
};

export function CleanerCard({ cleaner, isSelected, isDisabled = false, onSelect }: Props) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onSelect}
      className={cn(
        "relative flex w-full flex-col gap-2.5 rounded-2xl border p-4 text-left transition",
        isSelected && !isDisabled && "border-blue-600 bg-blue-50 shadow-sm ring-1 ring-blue-600/10",
        !isSelected && !isDisabled &&
          "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm",
        isDisabled && "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50",
      )}
    >
      {/* Top row: avatar + info + checkmark */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            isDisabled ? "bg-slate-100 text-slate-400" : cleaner.avatarColor,
          )}
          aria-hidden
        >
          {cleaner.initials}
        </div>

        {/* Name, rating, jobs */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold leading-snug",
              isSelected ? "text-blue-900" : "text-slate-900",
            )}
          >
            {cleaner.name}
          </p>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {cleaner.rating != null ? (
              <span className="flex items-center gap-0.5 text-xs text-slate-600">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                {cleaner.rating.toFixed(1)}
              </span>
            ) : null}
            <span className="text-xs text-slate-500">
              {cleaner.jobsCompleted.toLocaleString()} jobs
            </span>
          </div>

          {cleaner.areasServed && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {cleaner.areasServed}
            </p>
          )}
        </div>

        {/* Selected checkmark */}
        {isSelected && (
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"
            aria-label="Selected"
          />
        )}
      </div>

      {/* Badges + availability */}
      {(cleaner.badges.length > 0 || cleaner.slotEligible) && (
        <div className="flex flex-wrap gap-1.5">
          {cleaner.slotEligible && (
            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              Available
            </span>
          )}
          {cleaner.badges.map((badge) => {
            const cfg = BADGE_CONFIG[badge];
            return (
              <span
                key={badge}
                className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cfg.className)}
              >
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Disabled reason */}
      {isDisabled && cleaner.unavailableReason && (
        <p className="text-xs text-slate-500">{cleaner.unavailableReason}</p>
      )}
    </button>
  );
}
