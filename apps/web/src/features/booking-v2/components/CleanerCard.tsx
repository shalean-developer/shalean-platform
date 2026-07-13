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

const AREA_SPLIT = /[,·|/]+/;

/** Compact service-area display: show up to 2 areas, then "+N more". */
export function formatAreasServedPreview(
  areasServed: string | null | undefined,
  maxVisible = 2,
): { primary: string; moreCount: number } | null {
  if (!areasServed?.trim()) return null;
  const parts = areasServed
    .split(AREA_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length <= maxVisible) {
    return { primary: parts.join(" · "), moreCount: 0 };
  }
  return {
    primary: parts.slice(0, maxVisible).join(" · "),
    moreCount: parts.length - maxVisible,
  };
}

type Props = {
  cleaner: AvailableCleanerV2;
  isSelected: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
};

export function CleanerCard({ cleaner, isSelected, isDisabled = false, onSelect }: Props) {
  const areas = formatAreasServedPreview(cleaner.areasServed);
  const showBadges = cleaner.badges.length > 0 || cleaner.slotEligible;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      disabled={isDisabled}
      onClick={onSelect}
      className={cn(
        "relative w-full max-w-full min-w-0 overflow-hidden rounded-2xl border p-3 text-left transition sm:p-4",
        isSelected && !isDisabled && "border-blue-600 bg-blue-50 shadow-sm ring-1 ring-blue-600/10",
        !isSelected &&
          !isDisabled &&
          "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm",
        isDisabled && "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-12 sm:w-12 sm:text-sm",
            isDisabled ? "bg-slate-100 text-slate-400" : cleaner.avatarColor,
          )}
          aria-hidden
        >
          {cleaner.initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-sm font-semibold leading-snug",
                  isSelected ? "text-blue-900" : "text-slate-900",
                )}
              >
                {cleaner.name}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {cleaner.rating != null ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-slate-600">
                    <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                    {cleaner.rating.toFixed(1)}
                  </span>
                ) : null}
                <span className="text-xs text-slate-500">
                  {cleaner.jobsCompleted.toLocaleString()} jobs
                </span>
              </div>
            </div>

            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center",
                !isSelected && "opacity-0",
              )}
              aria-hidden={!isSelected}
            >
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
            </span>
          </div>

          {areas ? (
            <div className="mt-1.5 min-w-0 text-xs text-slate-500">
              <p className="flex min-w-0 items-start gap-1">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 line-clamp-2 break-words">{areas.primary}</span>
              </p>
              {areas.moreCount > 0 ? (
                <p className="mt-0.5 pl-4 text-[11px] font-medium text-slate-400">
                  +{areas.moreCount} more area{areas.moreCount > 1 ? "s" : ""}
                </p>
              ) : null}
            </div>
          ) : null}

          {showBadges ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cleaner.slotEligible ? (
                <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                  Available
                </span>
              ) : null}
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
          ) : null}

          {isDisabled && cleaner.unavailableReason ? (
            <p className="mt-1.5 text-xs text-slate-500">{cleaner.unavailableReason}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}
