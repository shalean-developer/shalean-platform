"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Users, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PREFERRED_CLEANER_CUSTOMER_DISCLAIMER } from "@/lib/dispatch/preferredCleanerDispatchPolicy";
import { CleanerCard } from "@/src/features/booking-v2/components/CleanerCard";
import type { AvailableCleanerV2 } from "@/src/features/booking-v2/types";

const INITIAL_VISIBLE = 6;

type CleanerFetchParams = {
  serviceSlug: string;
  date: string;
  time: string;
  durationMinutes: number;
  locationId: string;
};

function useAvailableCleaners({ serviceSlug, date, time, durationMinutes, locationId }: CleanerFetchParams) {
  const [cleaners, setCleaners] = useState<AvailableCleanerV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceSlug) return;
    if (date && time && !locationId) {
      setCleaners([]);
      setLoading(false);
      setError("Select a suburb in Step 1 to see cleaners for your area.");
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ serviceSlug });
    if (date) params.set("date", date);
    if (time) params.set("time", time);
    if (durationMinutes) params.set("durationMinutes", String(durationMinutes));
    if (locationId) params.set("locationId", locationId);

    fetch(`/api/booking-v2/available-cleaners?${params.toString()}`)
      .then((r) => r.json())
      .then((json: { cleaners?: AvailableCleanerV2[]; error?: string }) => {
        if (json.error) {
          setError(json.error);
        } else {
          setCleaners(json.cleaners ?? []);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load cleaners.");
        setLoading(false);
      });
  // Re-fetch when date or time changes so the list stays slot-accurate
   
  }, [serviceSlug, date, time, durationMinutes, locationId]);

  return { cleaners, loading, error };
}

type Props = {
  serviceSlug: string;
  date: string;
  time: string;
  durationMinutes: number;
  locationId: string;
  selectedIds: string[];
  /** Current stored cleaner details — used to detect when a resync is needed. */
  selectedDetails: AvailableCleanerV2[];
  maxSelect: number;
  /** Called when a cleaner card is clicked (select or deselect). Full object provided so parent can persist details. */
  onToggle: (cleaner: AvailableCleanerV2) => void;
  /** Called when "Best available cleaner" is chosen — clears all selections. */
  onClearAll: () => void;
  /**
   * Called after cleaners load when stored `selectedDetails` is missing entries for some
   * `selectedIds` — allows parent to repopulate details (e.g. after localStorage restore).
   */
  onResync: (selected: AvailableCleanerV2[]) => void;
};

export function CleanerPreferenceSection({
  serviceSlug,
  date,
  time,
  durationMinutes,
  locationId,
  selectedIds,
  selectedDetails,
  maxSelect,
  onToggle,
  onClearAll,
  onResync,
}: Props) {
  const { cleaners, loading, error } = useAvailableCleaners({
    serviceSlug,
    date,
    time,
    durationMinutes,
    locationId,
  });

  // After cleaners load, resync details if selectedIds exist but details are stale/missing.
  // This handles the case where the user had IDs saved in localStorage but details weren't stored.
  useEffect(() => {
    if (cleaners.length === 0 || selectedIds.length === 0) return;
    const storedIds = new Set(selectedDetails.map((d) => d.id));
    const missing = selectedIds.filter((id) => !storedIds.has(id));
    if (missing.length === 0) return;
    const matched = cleaners.filter((c) => missing.includes(c.id));
    if (matched.length > 0) onResync(matched);
    // Run only when cleaners list changes (initial load / date-time refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleaners]);

  const [showAll, setShowAll] = useState(false);

  const visibleCleaners = showAll ? cleaners : cleaners.slice(0, INITIAL_VISIBLE);
  const hasMore = cleaners.length > INITIAL_VISIBLE;
  const bestAvailableSelected = selectedIds.length === 0;

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="text-center">
        <h3 className="text-sm font-semibold text-slate-900">Cleaner preference</h3>
      </div>

      {/* Best available option */}
      <button
        type="button"
        onClick={onClearAll}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition",
          bestAvailableSelected
            ? "border-blue-600 bg-blue-50 shadow-sm ring-1 ring-blue-600/10"
            : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm",
        )}
      >
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg",
            bestAvailableSelected
              ? "bg-blue-100 text-blue-600"
              : "bg-slate-100 text-slate-500",
          )}
        >
          <Users className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1">
          <p
            className={cn(
              "text-sm font-semibold",
              bestAvailableSelected ? "text-blue-900" : "text-slate-900",
            )}
          >
            Best available cleaner
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            We&apos;ll assign the highest-rated available cleaner for your booking.
          </p>
        </div>
        {bestAvailableSelected && (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" aria-label="Selected" />
        )}
      </button>

      {/* Cleaner list */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <AlertCircle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          {error} We&apos;ll assign the best available cleaner.
        </div>
      ) : cleaners.length === 0 ? (
        !date || !time ? (
          <p className="text-center text-xs text-slate-400">
            Select a date and time above to see available cleaners.
          </p>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
            No cleaners online for this slot — reserve and we&apos;ll assign the best available.
          </p>
        )
      ) : (
        <>
          {/* Helper text above the grid */}
          <p className="text-center text-xs text-slate-500">
            Select up to {maxSelect} preferred cleaner{maxSelect > 1 ? "s" : ""}, or we&apos;ll assign the best available cleaner.
          </p>

          {/* At-limit notice */}
          {selectedIds.length >= maxSelect && (
            <p className="text-center text-xs font-medium text-blue-600">
              You can select up to {maxSelect} preferred cleaner{maxSelect > 1 ? "s" : ""}.
            </p>
          )}

          {selectedIds.length > 0 ? (
            <p className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-center text-xs leading-relaxed text-blue-900">
              {PREFERRED_CLEANER_CUSTOMER_DISCLAIMER}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {visibleCleaners.map((cleaner) => {
              const isSelected = selectedIds.includes(cleaner.id);
              // Only truly unavailable cleaners are disabled — never based on selection count
              const isDisabled = !cleaner.isAvailable && !isSelected;
              return (
                <CleanerCard
                  key={cleaner.id}
                  cleaner={cleaner}
                  isSelected={isSelected}
                  isDisabled={isDisabled}
                  onSelect={() => {
                    // Always allow deselect; allow select only when under limit
                    if (isSelected || selectedIds.length < maxSelect) {
                      onToggle(cleaner);
                    }
                  }}
                />
              );
            })}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {showAll ? (
                <>
                  <ChevronUp className="h-4 w-4" aria-hidden /> Show fewer cleaners
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" aria-hidden />
                  Show {cleaners.length - INITIAL_VISIBLE} more cleaner
                  {cleaners.length - INITIAL_VISIBLE > 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
